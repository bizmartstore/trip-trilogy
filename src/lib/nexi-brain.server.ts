/**
 * NEXI local brain — keyword/intent engine that answers common traveller
 * questions WITHOUT calling Gemini. Runs on live hub data (which chat.ts
 * already caches), so it burns zero AI quota and keeps working through
 * rate limits. Coverage: English + Filipino/Taglish keywords.
 */
import { getBookingsForEmail, getSettings, getSnapshot } from "@/lib/store.server";
import type { Listing } from "@/lib/types";

export type Intent =
  | "greeting"
  | "thanks"
  | "goodbye"
  | "about"
  | "tours"
  | "stays"
  | "dining"
  | "packages"
  | "budget"
  | "destinations"
  | "romantic"
  | "family"
  | "booking_status"
  | "how_to_book"
  | "payment"
  | "cancellation"
  | "contact"
  | "office_hours";

/** Minimum intent score to answer locally without Gemini. */
const CONFIDENT_SCORE = 2;
/** Messages longer than this deserve the full AI. */
const MAX_LOCAL_WORDS = 16;

const INTENTS: Record<Intent, string[]> = {
  greeting: [
    "hi",
    "hii",
    "hiya",
    "hello",
    "helo",
    "helloo",
    "hellooo",
    "heyy",
    "heyyy",
    "hey",
    "yo",
    "sup",
    "howdy",
    "greetings",
    "good morning",
    "good afternoon",
    "good evening",
    "morning",
    "afternoon",
    "evening",
    "whats up",
    "what's up",
    "wassup",
    "wasup",
    "kumusta",
    "kamusta",
    "musta",
    "muzta",
    "magandang umaga",
    "magandang hapon",
    "magandang gabi",
    "uy",
    "oy",
    "aloha",
    "hola",
    "bonjour",
    "ciao",
    "namaste",
    "annyeong",
    "konnichiwa",
    "oi",
    "ehey",
    "hello po",
    "hi po",
    "musta na",
  ],
  thanks: [
    "thanks",
    "thank you",
    "thank u",
    "thankyou",
    "thankss",
    "thx",
    "thnx",
    "ty",
    "tnx",
    "salamat",
    "salamat po",
    "maraming salamat",
    "salamat kaayo",
    "appreciated",
    "appreciate it",
    "great thanks",
    "many thanks",
    "thanks a lot",
    "cheers",
    "nice one",
    "galing",
    "astig",
    "ang ganda",
    "wow ganda",
  ],
  goodbye: [
    "bye",
    "bye bye",
    "goodbye",
    "good bye",
    "see you",
    "see ya",
    "later",
    "laters",
    "paalam",
    "hanggang sa muli",
    "take care",
    "ingat",
    "ingat ka",
    "good night",
    "gn",
    "night night",
    "adios",
    "gtg",
    "got to go",
    "log out na ako",
    "unahan na",
  ],
  about: [
    "help",
    "what can you do",
    "who are you",
    "what are you",
    "what is this",
    "ano to",
    "ano ka",
    "sino ka",
    "what is nexora",
    "what's nexora",
    "about nexora",
    "about the app",
    "about this app",
    "what app is this",
    "what website is this",
    "how does this work",
    "what do you offer",
    "what do you sell",
    "your services",
    "services",
    "features",
    "offers",
    "promos mo",
    "anu meron kayo",
    "ano meron kayo",
    "paano to",
    "how to use",
    "guide me",
    "options",
    "menu ng site",
    "anu tong site",
  ],
  tours: [
    "tour",
    "tours",
    "island hopping",
    "snorkel",
    "snorkeling",
    "snorkelling",
    "diving",
    "dive",
    "scuba",
    "wreck",
    "wrecks",
    "lagoon",
    "lagoons",
    "kayak",
    "kayaking",
    "cruise",
    "catamaran",
    "bangka",
    "boat",
    "boat tour",
    "expedition",
    "trek",
    "hike",
    "hiking",
    "waterfall",
    "underground river",
    "firefly",
    "fireflies",
    "sunset cruise",
    "activity",
    "activities",
    "things to do",
    "what to do",
    "day tour",
    "trip",
    "trips",
    "escapade",
    "lakwatsa",
    "gala",
    "pasyal",
    "pasyalan",
    "outing",
    "excursion",
    "sandbar",
    "beach hop",
    "swimming with",
    "tourist spots",
    "spot",
    "spots",
    "recommend tour",
    "best tour",
    "popular tour",
    "top tour",
  ],
  stays: [
    "stay",
    "stays",
    "hotel",
    "hotels",
    "resort",
    "resorts",
    "hostel",
    "hostels",
    "lodge",
    "lodges",
    "inn",
    "villas",
    "villa",
    "cottage",
    "cottages",
    "accommodation",
    "accommodations",
    "place to stay",
    "places to stay",
    "where to sleep",
    "where to stay",
    "room",
    "rooms",
    "overnight",
    "tulugan",
    "tuluyan",
    "matutulugan",
    "apartment",
    "airbnb",
    "beachfront stay",
    "pool",
    "infinity pool",
    "spa",
    "recommend hotel",
    "best hotel",
    "hotel near",
  ],
  dining: [
    "restaurant",
    "restaurants",
    "eat",
    "eating",
    "food",
    "foods",
    "dining",
    "dinner",
    "lunch",
    "breakfast",
    "brunch",
    "cafe",
    "coffee shop",
    "seafood",
    "grill",
    "grilled",
    "menu",
    "hungry",
    "gutom",
    "kain",
    "kainan",
    "kakain",
    "pagkain",
    "resto",
    "lutong",
    "where to eat",
    "san kain",
    "saan kain",
    "buffet",
    "dessert",
    "drinks",
    "bar",
    "rooftop",
    "kinilaw",
    "best restaurant",
    "popular restaurant",
  ],
  packages: [
    "package",
    "packages",
    "bundle",
    "bundles",
    "deal",
    "deals",
    "promo",
    "promos",
    "combo",
    "all in",
    "all-in",
    "inclusions",
    "exclusions",
    "tier",
    "tiers",
    "standard package",
    "premium package",
    "luxury package",
    "travel package",
    "package deal",
    "anong kasama",
    "kasama na",
    "what's included",
    "whats included",
  ],
  budget: [
    "cheap",
    "cheapest",
    "affordable",
    "budget",
    "low cost",
    "lowcost",
    "murang",
    "mura",
    "pinakamura",
    "tipid",
    "sulit",
    "under",
    "below",
    "less than",
    "not more than",
    "price",
    "prices",
    "pricing",
    "cost",
    "how much",
    "howmuch",
    "magkano",
    "mag kano",
    "presyo",
    "bayad",
    "fee",
    "fees",
    "rate",
    "rates",
    "mahal ba",
    "expensive",
    "worth it ba",
    "student budget",
    "tight budget",
  ],
  destinations: [
    "destination",
    "destinations",
    "places",
    "islands",
    "island",
    "where to go",
    "saan pupunta",
    "saan maganda",
    "where na",
    "el nido",
    "coron",
    "puerto princesa",
    "port barton",
    "san vicente",
    "balabac",
    "palawan",
    "bacuit",
    "long beach",
    "nagtabon",
    "nacpan",
    "nakpan",
    "big lagoon",
    "small lagoon",
    "twin lagoon",
    "kayangan",
    "barracuda lake",
    "sabang",
    "inaladelan",
    "pink sand",
    "must visit",
  ],
  romantic: [
    "romantic",
    "romance",
    "honeymoon",
    "honeymooners",
    "couple",
    "couples",
    "anniversary",
    "proposal",
    "propose",
    "date",
    "date idea",
    "valentine",
    "girlfriend",
    "boyfriend",
    "wife",
    "husband",
    "fiance",
    "fiancee",
    "partner",
    "special someone",
    "kakilala ko",
    "for two",
    "just the two",
    "babymoon",
    "surprise",
    "sunset dinner",
    "private",
  ],
  family: [
    "family",
    "families",
    "kids",
    "kid",
    "children",
    "child",
    "toddler",
    "toddlers",
    "baby",
    "baby friendly",
    "kid friendly",
    "barkada",
    "group",
    "group of friends",
    "friends",
    "senior",
    "seniors",
    "elders",
    "parents",
    "nanay",
    "tatay",
    "lola",
    "lolo",
    "safe for kids",
    "beginner friendly",
    "non swimmer",
    "di marunong lumangoy",
  ],
  booking_status: [
    "status",
    "my booking",
    "my reservation",
    "booking status",
    "reservation status",
    "approved",
    "approved na",
    "na approve",
    "naapprove",
    "confirm",
    "confirmed na",
    "pending",
    "pending pa",
    "pending pa rin",
    "rejected",
    "declined",
    "cancelled ko",
    "reference",
    "reference number",
    "receipt",
    "check my booking",
    "check my reservation",
    "asan booking ko",
    "nasaan booking ko",
    "booking ko",
    "reserve ko",
    "na book ko ba",
    "did you receive my booking",
    "received my payment",
    "if approved",
  ],
  how_to_book: [
    "book",
    "booking",
    "reserve",
    "reservation",
    "how to book",
    "how do i book",
    "paano mag book",
    "paano magbook",
    "paano bumook",
    "gusto kong i-book",
    "i want to book",
    "i want to reserve",
    "schedule",
    "availability",
    "available",
    "available ba",
    "slots",
    "slot",
    "seats",
    "seat left",
    "fully booked",
    "walk in",
    "walkin",
    "same day booking",
    "last minute",
  ],
  payment: [
    "payment",
    "payments",
    "pay",
    "paying",
    "paid",
    "gcash",
    "maya",
    "paymaya",
    "gotyme",
    "bpi",
    "bdo",
    "bank transfer",
    "credit card",
    "debit card",
    "paypal",
    "cash",
    "deposit",
    "downpayment",
    "down payment",
    "partial",
    "full payment",
    "bayaran",
    "kabayaran",
    "magbayad",
    "invoice",
    "receipt payment",
    "installment",
    "refund ko",
    "when to pay",
    "kelan bayad",
    "kung kelan bayaran",
  ],
  cancellation: [
    "cancel",
    "cancelling",
    "cancellation",
    "refund",
    "refunds",
    "refunded",
    "rebook",
    "re-schedule",
    "reschedule",
    "resched",
    "move date",
    "change date",
    "ibang date",
    "bawiin",
    "kanselado",
    "ibalik ang bayad",
    "policy",
    "policies",
    "terms",
    "cancellation policy",
    "maaari ba icancel",
    "pwede bang icancel",
    "mahuhuli kami",
    "late cancellation",
    "weather cancel",
    "bagyo",
  ],
  contact: [
    "contact",
    "contact number",
    "phone",
    "phone number",
    "call",
    "callback",
    "email",
    "viber",
    "whatsapp",
    "messenger",
    "facebook page",
    "instagram",
    "customer service",
    "customer support",
    "support",
    "human",
    "real person",
    "agent",
    "staff",
    "admin",
    "tawag",
    "tawagan",
    "text ko",
    "i-message",
    "message niyo ako",
    "reachable",
    "how to reach",
    "sino tawag ko",
    "cellphone number",
  ],
  office_hours: [
    "hours",
    "open",
    "opening",
    "closing",
    "close",
    "office hours",
    "operating hours",
    "oras",
    "oras kayo",
    "bukas kayo",
    "open ba kayo",
    "open kayo",
    "weekend",
    "sunday",
    "holiday",
    "24 hours",
    "what time",
    "anong oras",
  ],
};

const DESTINATION_NAMES = [
  "El Nido",
  "Coron",
  "Puerto Princesa",
  "Port Barton",
  "San Vicente",
  "Balabac",
];

function normalize(text: string) {
  return ` ${text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Score = total keyword hits; phrases weigh more than single words. */
export function detectIntent(rawText: string): { intent: Intent | null; score: number } {
  const text = normalize(rawText);
  let best: Intent | null = null;
  let bestScore = 0;
  for (const [intent, keywords] of Object.entries(INTENTS) as [Intent, string[]][]) {
    let score = 0;
    for (const kw of keywords) {
      if (kw.includes(" ")) {
        if (text.includes(` ${kw} `) || text.includes(`${kw} `) || text.includes(` ${kw}`)) {
          score += kw.split(" ").length + 1;
        }
      } else if (new RegExp(` ${escapeRe(kw)}[\\s']`).test(text)) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = intent;
    }
  }
  return { intent: best, score: bestScore };
}

/* ------------------------------ formatting helpers ------------------------------ */

const peso = (n: number) => `₱${n.toLocaleString()}`;
const mdLink = (title: string, slug: string) => `[${title}](/listing/${slug})`;

function listingLine(l: Listing) {
  const duration =
    l.durationDays || l.durationNights
      ? ` · ${[l.durationDays && `${l.durationDays}d`, l.durationNights && `${l.durationNights}n`].filter(Boolean).join(" ")}`
      : "";
  return `- ${mdLink(l.title, l.slug)} — ${peso(l.price)} ${l.unit}${duration}\n   ${l.tagline}`;
}

function listingLines(list: Listing[], max = 5) {
  return list.slice(0, max).map(listingLine).join("\n");
}

function extractBudget(text: string): number | null {
  const m = normalize(text).match(
    /(?:under|below|less than|max|budget|hanggang|up to|not more than)\s*(?:php|p|₱)?\s*([\d,]{3,7})/,
  );
  if (m) return Number(m[1].replace(/,/g, ""));
  const pesoMatch = text.match(/₱\s?([\d,]{3,7})/);
  if (pesoMatch) return Number(pesoMatch[1].replace(/,/g, ""));
  return null;
}

/* ------------------------------ answer builders ------------------------------ */

async function recommendedListings(
  filter: (l: Listing) => boolean,
  sort?: (a: Listing, b: Listing) => number,
) {
  const state = await getSnapshot();
  const pool = state.listings.filter((l) => l.status === "approved" && filter(l));
  return sort ? pool.sort(sort) : pool.sort((a, b) => b.reviewCount - a.reviewCount);
}

async function answerCatalogIntent(intent: Intent, rawText: string): Promise<string> {
  switch (intent) {
    case "tours": {
      const tours = await recommendedListings((l) => l.kind === "tour");
      return `Here are our guest-favourite tours:\n\n${listingLines(tours)}\n\nBrowse everything on the [Explore page](/explore), or plan a route with the [Trip Planner](/planner). 🏝️`;
    }
    case "stays": {
      const stays = await recommendedListings((l) => l.kind === "stay");
      return `Hand-picked stays across Palawan:\n\n${listingLines(stays)}\n\nOpen any of them to pick rooms and book instantly. 🏨`;
    }
    case "dining": {
      const dining = await recommendedListings((l) => l.kind === "restaurant");
      return `Standout tables worth booking ahead:\n\n${listingLines(dining)}\n\nEach page shows menus, best-sellers and reservation times. 🍽️`;
    }
    case "packages": {
      const state = await getSnapshot();
      const lines = (state.packages ?? [])
        .filter((p) => p.active !== false)
        .sort((a, b) => a.price - b.price)
        .map(
          (p) =>
            `- **${p.name}** — ${peso(p.price)}${p.durationDays ? ` · ${p.durationDays} days` : ""}${
              p.guestLimit ? ` · up to ${p.guestLimit} guests` : ""
            }\n   Includes: ${(p.inclusions ?? []).slice(0, 4).join(", ")}`,
        )
        .join("\n");
      return `Our travel package tiers:\n\n${lines}\n\nEvery tour and stay shows its available tiers before you book. 💰`;
    }
    case "budget": {
      const cap = extractBudget(rawText) ?? 5000;
      const cheap = await recommendedListings(
        (l) => l.price <= cap,
        (a, b) => a.price - b.price,
      );
      if (!cheap.length) {
        return `Nothing falls under ${peso(cap)} right now — our most affordable option starts at ${peso(
          Math.min(...(await recommendedListings(() => true)).map((l) => l.price)),
        )}. Check them all on the [Explore page](/explore). 🙂`;
      }
      return `Adventures under ${peso(cap)}:\n\n${listingLines(cheap)}\n\nAll prices are final at checkout — no hidden fees. 🪙`;
    }
    case "destinations": {
      const state = await getSnapshot();
      const lines = state.destinations
        .map((d) => `- **${d.name}** (${d.country}) — ${d.tagline}`)
        .join("\n");
      return `We cover Palawan's best spots:\n\n${lines}\n\nStart exploring any of them on the [Explore page](/explore). 🗺️`;
    }
    case "romantic": {
      const romantic = await recommendedListings(
        (l) => l.tags.includes("romantic") || l.tags.includes("luxury"),
      );
      return `Perfect for two ❤️:\n\n${listingLines(romantic)}\n\nWant a sunset dinner or private island vibe added? Just ask!`;
    }
    case "family": {
      const fam = await recommendedListings((l) => l.tags.includes("family friendly"));
      return `Great for the whole barkada or family 👨‍👩‍👧:\n\n${listingLines(fam)}\n\nAll are beginner-friendly, and guides assist non-swimmers on boat tours.`;
    }
    default:
      return "";
  }
}

async function answerDestinationQuestion(rawText: string): Promise<string | null> {
  const lower = rawText.toLowerCase();
  const dest = DESTINATION_NAMES.find((d) => lower.includes(d.toLowerCase()));
  if (!dest) return null;
  const pool = await recommendedListings((l) => l.destination === dest);
  if (!pool.length) return null;
  const kinds: [string, Listing["kind"]][] = [
    ["Tours", "tour"],
    ["Stays", "stay"],
    ["Dining", "restaurant"],
  ];
  const sections = kinds
    .map(([label, kind]) => ({ label, items: pool.filter((l) => l.kind === kind) }))
    .filter((s) => s.items.length)
    .map((s) => `**${s.label} in ${dest}:**\n${listingLines(s.items, 4)}`)
    .join("\n\n");
  return `Here's what we have in **${dest}**:\n\n${sections}\n\nSee everything on the [Explore page](/explore). ✈️`;
}

async function answerListingDetail(rawText: string): Promise<string | null> {
  const words = normalize(rawText)
    .trim()
    .split(" ")
    .filter((w) => w.length > 3);
  if (words.length < 1) return null;
  const state = await getSnapshot();
  let best: { listing: Listing; hits: number } | null = null;
  for (const l of state.listings) {
    if (l.status !== "approved") continue;
    const titleWords = normalize(l.title).trim().split(" ");
    const hits = words.filter((w) =>
      titleWords.some((t) => t.startsWith(w.slice(0, Math.max(4, w.length - 1)))),
    ).length;
    if (hits >= 2 && (!best || hits > best.hits)) best = { listing: l, hits };
  }
  if (!best) return null;
  const l = best.listing;
  const extras: string[] = [];
  if (l.packages?.length) {
    extras.push(
      `**Package tiers:** ${(l.packages ?? [])
        .filter((p) => p.active !== false)
        .map((p) => `${p.name} ${peso(p.price)}`)
        .join(" · ")}`,
    );
  }
  if (l.rooms?.length) {
    extras.push(`**Rooms:** ${l.rooms.map((r) => `${r.name} ${peso(r.price)}/night`).join(" · ")}`);
  }
  if (l.inclusions?.length) extras.push(`**Includes:** ${l.inclusions.slice(0, 5).join(", ")}`);
  if (l.cancellationPolicy) extras.push(`**Cancellation:** ${l.cancellationPolicy}`);
  return [
    `**${l.title}** — ${l.tagline}`,
    "",
    l.description,
    "",
    `${extras.join("\n")}`,
    "",
    `📍 ${l.destination} · ${peso(l.price)} ${l.unit}`,
    `👉 Full details & booking: ${mdLink(l.title, l.slug)}`,
  ].join("\n");
}

async function answerBookingStatus(allMessages: string[]): Promise<string> {
  const joined = allMessages.join(" \n ");
  const emailMatch = joined.match(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/);
  const dateMatches = [...joined.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)].map((m) => m[0]);
  for (const m of joined.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g)) {
    dateMatches.push(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`);
  }

  if (!emailMatch) {
    return `I can check that for you! 📋 Just send me:\n\n1. The **email address** you used when booking\n2. The **date you booked** (or your travel date)\n\n…or open your [Dashboard](/dashboard) anytime to see every reservation.`;
  }

  try {
    const bookings = await getBookingsForEmail(emailMatch[0]);
    let relevant = bookings;
    if (dateMatches.length) {
      const matched = bookings.filter((b) => {
        const start = b.startDate || b.date;
        const end = b.endDate || start;
        return dateMatches.some((d) => d >= start && d <= end);
      });
      if (matched.length) relevant = matched;
    }
    if (!relevant.length) {
      return `I couldn't find any reservations for **${emailMatch[0]}**${
        dateMatches.length ? " on that date" : ""
      }. Double-check the spelling, or view all your bookings in the [Dashboard](/dashboard). 🔍`;
    }
    const lines = relevant.slice(0, 6).map((b) => {
      const status = b.status.replace(/_/g, " ");
      const paid = b.paid ? "✅ paid" : "⏳ awaiting payment";
      return `- **${b.reference}** — ${b.listingTitle}\n   Dates: ${b.startDate || b.date}${
        b.endDate && b.endDate !== b.startDate ? ` to ${b.endDate}` : ""
      } · Status: **${status}** · ${paid} · ${peso(b.total)}\n   Receipt: [/booking/${b.reference}](/booking/${b.reference})`;
    });
    return `Found it! Here ${
      relevant.length === 1 ? "is your reservation" : `are your ${relevant.length} reservations`
    }:\n\n${lines.join("\n")}\n\nStatus meanings: **pending** = team is reviewing · **approved** = confirmed · **completed** = trip finished. Anything else? 😊`;
  } catch {
    return "I had trouble pulling up reservations just now — please try again in a moment.";
  }
}

async function simpleAnswers(intent: Intent): Promise<string> {
  switch (intent) {
    case "greeting":
      return "Hello, welcome to Nexora! 👋🤖\nI'm NEXI — ask me about our **tours**, **stays**, **dining** and **travel packages** in Palawan, or give me the **email + date you booked** and I'll check your reservation.\nTry: *“best tour in Coron”* or *“magkano ang island hopping?”*";
    case "thanks":
      return "You're very welcome! 😊 Enjoy planning your Palawan trip — I'm here whenever you need me.";
    case "goodbye":
      return "Ingat! 🌊 Safe travels, and see you here at Nexora when you're ready to book your next adventure.";
    case "about":
      return "I'm **NEXI**, the Nexora AI concierge 🤖 — Nexora is a premium travel marketplace for **Palawan**: book verified island-hopping **tours**, hand-picked **stays**, standout **restaurants**, and all-in **travel packages**.\n\nWhat I can do:\n- Recommend experiences & quote exact prices\n- Check your **reservation status** (give me your email + booking date)\n- Explain policies, payments and how booking works\n\nStart browsing on the [Explore page](/explore)!";
    case "how_to_book":
      return `Booking takes about a minute:\n\n1. Find an experience on the [Explore page](/explore)\n2. Pick your **date, guests and package tier**\n3. Confirm — you'll get an instant **reference number** and the team approves quickly (you'll be notified)\n\nTrack everything in your [Dashboard](/dashboard). 📅`;
    case "payment":
      return `Here's how payment works 💳:\n\n1. Submit your reservation — no payment needed upfront\n2. Once the team **approves** your booking, they'll send payment instructions\n3. Pay, and your receipt updates in your [Dashboard](/dashboard)\n\nFor payment concerns, reach the team via the [Contact page](/help-centre).`;
    case "cancellation":
      return `Cancellation, short version ❌:\n\n- Most listings allow **free cancellation 48 hours–14 days** before your start date (the exact window is shown on each listing)\n- After the window, typically **50% refundable**\n- Operator-cancelled trips (e.g. bad weather) are **always fully refunded**\n\nFull terms: [Cancellation Policy](/cancellation-policy).`;
    case "contact": {
      const s = await getSettings();
      const lines = [
        s.contactEmail && `- Email: ${s.contactEmail}`,
        s.contactPhone && `- Phone: ${s.contactPhone}`,
        s.contactMobile && `- Mobile / Viber / WhatsApp: ${s.contactMobile}`,
        s.officeHours && `- Office hours: ${s.officeHours}`,
      ]
        .filter(Boolean)
        .join("\n");
      return `Happy to connect you with the human team ☎️:\n\n${lines || "- Reach us via the [Help Centre](/help-centre)."}\n\nYou can also browse the [Help Centre](/help-centre) for detailed guides.`;
    }
    case "office_hours": {
      const s = await getSettings();
      return `We're usually available **${s.officeHours || "daily"}** ⏰ — bookings made outside those hours are reviewed first thing next session.\n\nNeed urgent help? Contact details are here: [Help Centre](/help-centre).`;
    }
    default:
      return "";
  }
}

/* ------------------------------ public API ------------------------------ */

export interface LocalAnswer {
  text: string;
  intent: Intent | "fallback";
}

/** True when we're confident enough to skip Gemini entirely. */
export function isConfident(score: number, wordCount: number) {
  return score >= CONFIDENT_SCORE && wordCount <= MAX_LOCAL_WORDS;
}

export async function buildLocalAnswer(
  lastUserText: string,
  allUserMessages: string[],
  forced = false,
): Promise<LocalAnswer> {
  const { intent, score } = detectIntent(lastUserText);

  // Strongest signals first: booking status needs real data, destinations and
  // listing names beat generic keywords.
  if (intent === "booking_status" || /status|approved|reference/i.test(lastUserText)) {
    return { text: await answerBookingStatus(allUserMessages), intent: "booking_status" };
  }

  const listingDetail = await answerListingDetail(lastUserText);
  if (listingDetail) return { text: listingDetail, intent: "tours" };

  const destAnswer = await answerDestinationQuestion(lastUserText);
  if (destAnswer && score >= CONFIDENT_SCORE) return { text: destAnswer, intent: "destinations" };

  if (intent && (score >= CONFIDENT_SCORE || forced)) {
    const catalog = [
      "tours",
      "stays",
      "dining",
      "packages",
      "budget",
      "destinations",
      "romantic",
      "family",
    ] as const;
    if ((catalog as readonly string[]).includes(intent)) {
      const text = await answerCatalogIntent(intent, lastUserText);
      if (text) return { text, intent };
    }
    const text = await simpleAnswers(intent);
    if (text) return { text, intent };
  }

  // Fallback: still helpful, never an error screen.
  const state = await getSnapshot();
  const featured = state.listings.filter((l) => l.status === "approved").slice(0, 3);
  return {
    intent: "fallback",
    text: `I want to make sure I answer that well! 🤔 While our full AI mind refreshes, here's a quick taste of Nexora:\n\n${listingLines(
      featured,
    )}\n\nTry asking about **tours**, **stays**, **packages**, **prices** (*“magkano?”*), or your **booking status** — or browse everything on the [Explore page](/explore).`,
  };
}
