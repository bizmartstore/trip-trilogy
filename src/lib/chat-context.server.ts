import {
  BOOKING_STATUS_LABELS,
  formatPeso,
  type ChatBookingLookup,
} from "@/lib/chat-shared";
import { getBookingsForEmail, getSettings, getSnapshot } from "@/lib/store.server";
import type { Listing, ListingPackage } from "@/lib/types";

function packageTiers(packages?: ListingPackage[]): string {
  const active = (packages ?? []).filter((p) => p.active !== false);
  if (!active.length) return "";
  return active
    .map(
      (p) =>
        `${p.name} ${formatPeso(p.price)}${p.pricingType === "per_night" ? "/night" : "/person"}${
          p.durationDays ? ` (${p.durationDays}D${p.durationNights ? `${p.durationNights}N` : ""})` : ""
        }`,
    )
    .join("; ");
}

function listingLine(listing: Listing): string {
  const parts = [
    `"${listing.title}" (${listing.kind})`,
    listing.destination,
    `${formatPeso(listing.price)} ${listing.unit}`.trim(),
    `rated ${listing.rating}/5 (${listing.reviewCount} reviews)`,
  ];
  if (listing.durationDays) {
    parts.push(
      `duration ${listing.durationDays} day${listing.durationDays > 1 ? "s" : ""}${
        listing.durationNights ? ` / ${listing.durationNights} night${listing.durationNights > 1 ? "s" : ""}` : ""
      }`,
    );
  }
  if (listing.discountPct) parts.push(`${listing.discountPct}% off`);
  if (listing.seatsLeft !== undefined && listing.seatsLeft <= 10) {
    parts.push(`only ${listing.seatsLeft} slots left`);
  }
  if (listing.available === false) {
    parts.push(`currently unavailable${listing.unavailableReason ? ` (${listing.unavailableReason})` : ""}`);
  }
  const tiers = packageTiers(listing.packages);
  const inclusions = (listing.inclusions ?? []).slice(0, 5).join(", ");
  return [
    `- ${parts.join(" · ")}`,
    listing.tagline ? `  ${listing.tagline}` : "",
    tiers ? `  Packages: ${tiers}` : "",
    inclusions ? `  Inclusions: ${inclusions}` : "",
    listing.category ? `  Category: ${listing.category}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Build the system prompt from the LIVE hub data so the assistant always
 *  answers with current listings, packages, prices and contact details. */
export async function buildChatSystemPrompt(): Promise<string> {
  const [state, settings] = await Promise.all([getSnapshot(), getSettings()]);

  const published = state.listings.filter((l) => l.status === "approved");
  const tours = published.filter((l) => l.kind === "tour");
  const stays = published.filter((l) => l.kind === "stay");
  const restaurants = published.filter((l) => l.kind === "restaurant");
  const packageListings = published.filter((l) => l.kind === "package");
  const destinations = state.destinations.map((d) => `${d.name} (${d.tagline})`).join("; ");

  const section = (title: string, items: Listing[]) =>
    items.length
      ? `### ${title}\n${items.map(listingLine).join("\n")}`
      : "";

  return `You are Nexi, the friendly AI concierge of Nexora — a premium tourism marketplace for Palawan, Philippines. Tourists use Nexora to discover, plan and book island tours, accommodations (stays), restaurants and curated travel packages.

# How Nexora works
- Currency: Philippine Peso (₱ / PHP). Always quote prices in pesos.
- Booking: guests can reserve WITHOUT an account (guest checkout) or sign in (email or Google) to track trips in "My Trips" (the dashboard).
- Every reservation starts as PENDING and is reviewed by the Nexora admin team. Once reviewed it becomes approved (or rejected with a note). There is no automated email — customers are notified by CALL or TEXT (SMS) using the phone number they gave at checkout, and registered users also see status updates in their dashboard and notifications.
- Follow-ups: customers can call or text the admin team anytime.
  - Phone: ${settings.contactPhone || "see footer"}
  - Mobile / SMS / Viber / WhatsApp: ${settings.contactMobile || settings.contactPhone || "see footer"}
  - Email: ${settings.contactEmail || "see footer"}
  - Office hours: ${settings.officeHours || "daily"}
  - Address: ${settings.contactAddress || "Palawan, Philippines"}
- Pages: Explore/search at /explore (filter by Tours, Stays, Dining, Packages), Smart Trip Planner at /planner (generates a budget-matched itinerary), listing details at /listing/<slug>, Help Centre /help-centre, Cancellation policy /cancellation-policy, Privacy /privacy-policy, Terms /terms-of-service.
- ${settings.cancellationNotice || "Cancellations follow the policy on each listing and the site cancellation policy page."}
- Nexora is also an installable app (PWA) — "Install app" from the banner.

# Destinations covered
${destinations || "El Nido, Coron, Puerto Princesa, Port Barton, San Vicente"}

# Live catalog (accurate as of right now — use ONLY this data)
${section("TOURS", tours)}
${section("STAYS / ACCOMMODATIONS", stays)}
${section("RESTAURANTS / DINING", restaurants)}
${section("TRAVEL PACKAGES", packageListings)}

# Reservation status checks
- When a customer asks about THEIR reservation (approved? status?), ALWAYS use the checkBookingStatus tool — never guess.
- You need the email address used at booking. If they didn't give one, ask for it politely. The booking date (or trip date) is optional but helps when they have several reservations.
- Summarize the tool result in friendly plain language: what the status means, the reference code, dates and total. If pending, explain the team reviews it shortly and they'll get a call/text. If rejected, share the admin note if present and offer the contact number.
- Never reveal any other customer's data, and never expose raw JSON.

# Style rules
- Be warm, concise and premium — like a knowledgeable Palawan travel concierge. Use short paragraphs and markdown lists/bold for prices.
- Answer ONLY from the catalog above: never invent listings, prices, discounts or availability. If something isn't listed, say so and point to /explore or the contact number.
- For "best/recommend" questions, pick from the catalog and say why (rating, inclusions, price fit).
- For bookings, guide them: open the listing → Book now → choose dates/package → checkout (guest or signed in). Mention payment is settled with the admin team (e.g. PayMaya) after approval when relevant.
- If asked something unrelated to Nexora/Palawan travel, politely redirect.`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Tool implementation: look up reservations by customer email (+ optional date). */
export async function lookupBookingsForChat(
  email: string,
  bookingDate?: string | null,
): Promise<ChatBookingLookup> {
  const trimmed = (email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(trimmed)) {
    return {
      found: false,
      email: trimmed,
      bookings: [],
      totalMatches: 0,
      message: "invalid-email",
    };
  }

  let bookings = await getBookingsForEmail(trimmed);

  const wanted = (bookingDate ?? "").trim();
  if (wanted) {
    const matches = bookings.filter((b) => {
      const candidates = [b.createdAt, b.date, b.startDate]
        .filter(Boolean)
        .map((d) => String(d).slice(0, 10));
      return candidates.includes(wanted);
    });
    // If the date filter wipes everything out, fall back to all bookings for
    // the email so the customer still gets a useful answer.
    if (matches.length) bookings = matches;
  }

  const top = bookings.slice(0, 5);
  return {
    found: top.length > 0,
    email: trimmed,
    totalMatches: bookings.length,
    bookings: top.map((b) => ({
      reference: b.reference,
      listingTitle: b.listingTitle,
      kind: b.kind,
      status: b.status,
      statusLabel: BOOKING_STATUS_LABELS[b.status] ?? b.status,
      guests: b.guests,
      startDate: b.startDate ?? b.date,
      endDate: b.endDate,
      total: b.total,
      totalLabel: formatPeso(b.total),
      paid: b.paid,
      bookedAt: b.createdAt?.slice(0, 10),
      adminNote: b.adminNote,
    })),
    message: top.length
      ? undefined
      : "no-bookings-found — double-check the email address is the one used at checkout",
  };
}
