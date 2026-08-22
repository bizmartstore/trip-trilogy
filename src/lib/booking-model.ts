/**
 * Shared booking/listing duration, pricing, availability, and display helpers.
 * Server and client both import this so checkout, records, admin, and notifications stay in sync.
 */
import type {
  Booking,
  BookingStatus,
  Listing,
  ListingKind,
  ListingPackage,
  PackageBillingType,
  PricingType,
} from "@/lib/types";
import { peso } from "@/lib/utils";

export const DEFAULT_PACKAGE_NAMES = ["Standard", "Premium", "Luxury"] as const;

/** Stable IDs so sample packages survive restarts and match SQL seed rows. */
export const SEED_PACKAGE_IDS = {
  standard: "pkg-standard-nexora",
  premium: "pkg-premium-nexora",
  luxury: "pkg-luxury-nexora",
} as const;

export const PRICING_TYPE_LABELS: Record<PricingType, string> = {
  per_person: "Per Person",
  per_night: "Per Night",
  per_package: "Per Package",
};

export const PACKAGE_BILLING_LABELS: Record<PackageBillingType, string> = {
  per_person: "Per Person",
  per_night: "Per Night",
};

const ACTIVE_OCCUPANCY: BookingStatus[] = ["pending", "approved", "confirmed"];

export function resolvePricingType(listing: Pick<Listing, "kind" | "unit" | "pricingType">): PricingType {
  if (listing.kind === "package") return "per_package";
  if (listing.pricingType) return listing.pricingType;
  const unit = (listing.unit ?? "").toLowerCase();
  if (unit.includes("package")) return "per_package";
  if (unit.includes("night")) return "per_night";
  return "per_person";
}

export function unitLabelForPricing(type: PricingType, kind: ListingKind) {
  if (type === "per_night") return "per night";
  if (type === "per_package") return "per package";
  if (kind === "restaurant") return "per cover";
  return "per person";
}

export function resolvePackageBilling(pkg?: Pick<ListingPackage, "pricingType">): PackageBillingType {
  return pkg?.pricingType === "per_night" ? "per_night" : "per_person";
}

export function discountedUnitPrice(price: number, discountPct?: number) {
  if (!discountPct || discountPct <= 0) return Math.max(0, Math.round(price));
  return Math.max(0, Math.round(price * (1 - discountPct / 100)));
}

export function resolveDuration(listing: Pick<Listing, "durationDays" | "durationNights" | "kind">) {
  const days = Math.max(1, Math.round(listing.durationDays ?? 1));
  const nights =
    listing.durationNights != null
      ? Math.max(0, Math.round(listing.durationNights))
      : listing.kind === "stay"
        ? Math.max(0, days - 1)
        : Math.max(0, days - 1);
  return { days, nights };
}

export function addDaysYmd(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function daysInclusive(startYmd: string, endYmd: string) {
  const a = Date.parse(`${startYmd}T00:00:00Z`);
  const b = Date.parse(`${endYmd}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 1;
  return Math.round((b - a) / 86_400_000) + 1;
}

export function nightsBetween(startYmd: string, endYmd: string) {
  return Math.max(0, daysInclusive(startYmd, endYmd) - 1);
}

export function listingUsesSchedule(kind: ListingKind) {
  return kind === "tour" || kind === "stay" || kind === "package";
}

/** Duration for checkout: selected package tier wins over listing defaults. */
export function resolveBookingDuration(
  listing: Pick<Listing, "durationDays" | "durationNights" | "kind">,
  pkg?: Pick<ListingPackage, "durationDays" | "durationNights"> | null,
) {
  if (pkg && (pkg.durationDays != null || pkg.durationNights != null)) {
    const days = Math.max(1, Math.round(pkg.durationDays ?? (pkg.durationNights ?? 0) + 1));
    const nights =
      pkg.durationNights != null
        ? Math.max(0, Math.round(pkg.durationNights))
        : Math.max(0, days - 1);
    return { days, nights };
  }
  return resolveDuration(listing);
}

export function listingStartTime(listing: Pick<Listing, "startTime" | "kind">) {
  if (listing.startTime) return listing.startTime;
  return listing.kind === "restaurant" ? "" : "08:00";
}

export function listingEndTime(listing: Pick<Listing, "endTime" | "kind">) {
  if (listing.endTime) return listing.endTime;
  return listing.kind === "restaurant" ? "" : "18:00";
}

export function computeEndDate(input: {
  startDate: string;
  durationDays: number;
  autoEndDate?: boolean;
  endDate?: string;
}) {
  if (input.autoEndDate === false && input.endDate) return input.endDate;
  return addDaysYmd(input.startDate, Math.max(0, input.durationDays - 1));
}

export function sortPackages(packages: ListingPackage[]) {
  return packages.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

export function activeCatalogPackages(catalog: ListingPackage[] | undefined) {
  return sortPackages((catalog ?? []).filter((pkg) => pkg.active !== false));
}

/**
 * Resolve the package tiers a listing should offer.
 * Prefer catalog IDs; fall back to hydrated/embedded packages when the client has no catalog.
 */
export function resolveListingPackages(
  listing: Pick<Listing, "packages" | "packageIds" | "pricingType" | "unit" | "kind">,
  catalog: ListingPackage[] | undefined,
): ListingPackage[] {
  if (resolvePricingType(listing) !== "per_package" && listing.kind !== "package") return [];
  const byId = new Map((catalog ?? []).map((pkg) => [pkg.id, pkg]));
  const embedById = new Map((listing.packages ?? []).map((pkg) => [pkg.id, pkg]));

  if (listing.packageIds?.length) {
    const fromCatalog = sortPackages(
      listing.packageIds.map((id) => byId.get(id)).filter((pkg): pkg is ListingPackage => !!pkg),
    );
    if (fromCatalog.length) return fromCatalog;

    // Client snapshots often ship packageIds + listing.packages without the full catalog.
    const fromEmbed = sortPackages(
      listing.packageIds
        .map((id) => embedById.get(id))
        .filter((pkg): pkg is ListingPackage => !!pkg),
    );
    if (fromEmbed.length) return fromEmbed;
    if (listing.packages?.length) return sortPackages(listing.packages);
    return [];
  }

  if (listing.packages?.length) {
    return sortPackages(listing.packages);
  }

  return activeCatalogPackages(catalog);
}

export function activePackages(
  listing: Pick<Listing, "packages" | "packageIds" | "pricingType" | "unit" | "kind">,
  catalog?: ListingPackage[],
) {
  return resolveListingPackages(listing, catalog).filter((pkg) => pkg.active !== false);
}

/** Rich sample catalog — editable from the admin Packages tab, not hard-coded in the UI. */
export function seedTravelPackages(): ListingPackage[] {
  return [
    {
      id: SEED_PACKAGE_IDS.standard,
      name: "Standard",
      description:
        "An affordable, complete travel experience with comfortable lodging, shared transfers, and the essential guided activities for first-time visitors.",
      price: 8_999,
      pricingType: "per_person",
      durationDays: 2,
      durationNights: 1,
      inclusions: [
        "Twin or triple room accommodation",
        "Daily breakfast",
        "Shared air-conditioned van transfers",
        "Guided island hopping (standard route)",
        "Tour coordinator on standby",
        "Bottled water during tours",
      ],
      exclusions: [
        "Flights and ferry tickets",
        "Personal expenses and souvenirs",
        "Travel insurance",
        "Premium or private activities",
        "Alcoholic beverages",
      ],
      guestLimit: 6,
      active: true,
      position: 0,
    },
    {
      id: SEED_PACKAGE_IDS.premium,
      name: "Premium",
      description:
        "Upgraded rooms, better meals, and additional guided experiences for travellers who want more comfort and inclusion without a fully private itinerary.",
      price: 15_999,
      pricingType: "per_person",
      durationDays: 3,
      durationNights: 2,
      inclusions: [
        "Deluxe room upgrade",
        "Breakfast plus one set lunch or dinner daily",
        "Priority shared or semi-private transfers",
        "Extended island and lagoon itinerary",
        "Snorkel gear rental",
        "Welcome drink on arrival",
        "Dedicated trip coordinator",
      ],
      exclusions: [
        "International or domestic flights",
        "Spa treatments and massage",
        "Private yacht or speedboat charter",
        "Travel insurance",
        "Tips and gratuities",
      ],
      guestLimit: 4,
      active: true,
      position: 1,
    },
    {
      id: SEED_PACKAGE_IDS.luxury,
      name: "Luxury",
      description:
        "Premium accommodation, private transportation, personalized concierge service, and exclusive activities for a fully elevated Palawan escape.",
      price: 28_999,
      pricingType: "per_person",
      durationDays: 4,
      durationNights: 3,
      inclusions: [
        "Premium suite or private villa night(s)",
        "All meals with private dining options",
        "Private air-conditioned vehicle and driver",
        "Exclusive activities (private lagoon or sunset cruise)",
        "Personal trip host throughout the stay",
        "Airport or pier meet and greet",
        "Priority reservations and flexible timing",
      ],
      exclusions: [
        "International airfare",
        "Shopping and personal purchases",
        "Optional gratuities",
        "Unlisted specialty experiences",
        "Travel insurance (available on request)",
      ],
      guestLimit: 4,
      active: true,
      position: 2,
    },
  ];
}

/** @deprecated Prefer seedTravelPackages() for the global catalog. */
export function defaultListingPackages(): ListingPackage[] {
  return seedTravelPackages().map((pkg, i) => ({
    ...pkg,
    id: crypto.randomUUID(),
    position: i,
  }));
}

export function findPackage(
  listing: Pick<Listing, "packages" | "packageIds">,
  packageId?: string,
  catalog?: ListingPackage[],
) {
  if (!packageId) return undefined;
  const fromListing = listing.packages?.find((pkg) => pkg.id === packageId);
  if (fromListing) return fromListing;
  return catalog?.find((pkg) => pkg.id === packageId);
}

export type QuoteInput = {
  guests: number;
  startDate: string;
  endDate?: string;
  packageId?: string;
};

export type BookingQuote = {
  pricingType: PricingType;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  durationDays: number;
  durationNights: number;
  guests: number;
  unitPrice: number;
  subtotal: number;
  total: number;
  packageId?: string;
  packageName?: string;
  packagePrice?: number;
  packageSnapshot?: ListingPackage;
};

export function quoteBooking(listing: Listing, input: QuoteInput): BookingQuote {
  const pricingType = resolvePricingType(listing);
  // Require an explicit tier — do not silently fall back to the first package.
  const selectedPkg =
    pricingType === "per_package" && input.packageId
      ? findPackage(listing, input.packageId)
      : undefined;
  const configured = resolveBookingDuration(listing, selectedPkg);
  const autoEnd = listing.autoEndDate !== false;
  const startDate = input.startDate;
  const endDate = listingUsesSchedule(listing.kind)
    ? computeEndDate({
        startDate,
        durationDays: configured.days,
        autoEndDate: autoEnd,
        endDate: input.endDate,
      })
    : startDate;
  const durationDays = listingUsesSchedule(listing.kind)
    ? autoEnd
      ? configured.days
      : daysInclusive(startDate, endDate)
    : 1;
  const durationNights = listingUsesSchedule(listing.kind)
    ? autoEnd
      ? configured.nights
      : nightsBetween(startDate, endDate)
    : 0;

  const guests = Math.max(1, Math.round(input.guests) || 1);
  const startTime = listingStartTime(listing);
  const endTime = listingEndTime(listing);
  let unitPrice = discountedUnitPrice(listing.price, listing.discountPct);

  let subtotal = unitPrice * guests;
  let packageId: string | undefined;
  let packageName: string | undefined;
  let packagePrice: number | undefined;
  let packageSnapshot: ListingPackage | undefined;

  if (pricingType === "per_night") {
    subtotal = unitPrice * Math.max(1, durationNights || durationDays);
  } else if (pricingType === "per_package") {
    const pkg = selectedPkg;
    if (!pkg) {
      subtotal = 0;
    } else {
      packageId = pkg.id;
      packageName = pkg.name;
      packagePrice = Math.max(0, Math.round(pkg.price));
      unitPrice = discountedUnitPrice(packagePrice, listing.discountPct);
      // Freeze a full copy so later catalog edits never rewrite this booking.
      packageSnapshot = {
        ...pkg,
        inclusions: [...(pkg.inclusions ?? [])],
        exclusions: [...(pkg.exclusions ?? [])],
      };
      const billing = resolvePackageBilling(pkg);
      if (billing === "per_night") {
        subtotal = unitPrice * Math.max(1, durationNights || durationDays);
      } else {
        subtotal = unitPrice * guests;
      }
      packagePrice = unitPrice;
    }
  } else {
    subtotal = unitPrice * guests;
  }

  return {
    pricingType,
    startDate,
    startTime,
    endDate,
    endTime,
    durationDays,
    durationNights,
    guests,
    unitPrice,
    subtotal,
    total: subtotal,
    packageId,
    packageName,
    packagePrice,
    packageSnapshot,
  };
}

export function bookingStartYmd(booking: Pick<Booking, "date" | "startDate">) {
  return (booking.startDate || booking.date || "").slice(0, 10);
}

export function bookingEndYmd(booking: Pick<Booking, "date" | "startDate" | "endDate">) {
  return (booking.endDate || booking.startDate || booking.date || "").slice(0, 10);
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}

export function bookingOccupiesRange(booking: Booking, start: string, end: string) {
  if (!ACTIVE_OCCUPANCY.includes(booking.status)) return false;
  return rangesOverlap(bookingStartYmd(booking), bookingEndYmd(booking), start, end);
}

export function occupiedGuests(
  bookings: Booking[],
  listingId: string,
  start: string,
  end: string,
  exceptBookingId?: string,
) {
  return bookings.reduce((sum, booking) => {
    if (booking.listingId !== listingId) return sum;
    if (exceptBookingId && booking.id === exceptBookingId) return sum;
    if (!bookingOccupiesRange(booking, start, end)) return sum;
    return sum + (booking.guests || 0);
  }, 0);
}

export function remainingCapacity(
  listing: Pick<Listing, "id" | "seatsLeft">,
  bookings: Booking[],
  start: string,
  end: string,
) {
  if (listing.seatsLeft == null || listing.seatsLeft <= 0) return null;
  return Math.max(0, listing.seatsLeft - occupiedGuests(bookings, listing.id, start, end));
}

export function assertBookingFitsCapacity(
  listing: Listing,
  bookings: Booking[],
  quote: BookingQuote,
) {
  if (quote.packageSnapshot?.guestLimit && quote.guests > quote.packageSnapshot.guestLimit) {
    throw new Error(`This package is limited to ${quote.packageSnapshot.guestLimit} guests.`);
  }
  const remaining = remainingCapacity(listing, bookings, quote.startDate, quote.endDate);
  if (remaining == null) return;
  if (quote.guests > remaining) {
    throw new Error(
      remaining <= 0
        ? "Those dates are fully booked."
        : `Only ${remaining} spot${remaining === 1 ? "" : "s"} left for those dates.`,
    );
  }
}

export function formatClock(time?: string) {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h)) return time;
  const dt = new Date(Date.UTC(2000, 0, 1, h, m || 0));
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(dt);
}

export function formatLongDate(ymd?: string) {
  if (!ymd) return "";
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatShortDate(ymd?: string) {
  if (!ymd) return "";
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatDateTime(ymd?: string, time?: string) {
  const date = formatLongDate(ymd);
  const clock = formatClock(time);
  if (date && clock) return `${date}, ${clock}`;
  return date || clock || "";
}

export function formatShortDateTime(ymd?: string, time?: string) {
  const date = formatShortDate(ymd);
  const clock = formatClock(time);
  if (date && clock) return `${date} – ${clock}`;
  return date || clock || "";
}

export function formatDurationLabel(days?: number, nights?: number) {
  const d = Math.max(1, days ?? 1);
  const n = Math.max(0, nights ?? Math.max(0, d - 1));
  return `${d} Day${d === 1 ? "" : "s"} / ${n} Night${n === 1 ? "" : "s"}`;
}

export function bookingDateRangeLabel(booking: Booking) {
  const start = formatDateTime(bookingStartYmd(booking), booking.startTime);
  const end = formatDateTime(bookingEndYmd(booking), booking.endTime);
  if (start && end && bookingStartYmd(booking) !== bookingEndYmd(booking)) {
    return `${start} – ${end}`;
  }
  return start || booking.date;
}

export function bookingDurationLabel(booking: Booking) {
  if (booking.durationDays || booking.durationNights) {
    return formatDurationLabel(booking.durationDays, booking.durationNights);
  }
  const days = daysInclusive(bookingStartYmd(booking), bookingEndYmd(booking));
  return formatDurationLabel(days, Math.max(0, days - 1));
}

export function listingDurationLabel(listing: Pick<Listing, "durationDays" | "durationNights" | "kind" | "packages">) {
  const pkgs = (listing.packages ?? []).filter((p) => p.active !== false);
  if (listing.kind === "package" && pkgs.length) {
    const days = pkgs.map((p) => resolveBookingDuration(listing, p).days);
    const nights = pkgs.map((p) => resolveBookingDuration(listing, p).nights);
    const minD = Math.min(...days);
    const maxD = Math.max(...days);
    const minN = Math.min(...nights);
    const maxN = Math.max(...nights);
    if (minD === maxD && minN === maxN) return formatDurationLabel(minD, minN);
    return `${formatDurationLabel(minD, minN)} – ${formatDurationLabel(maxD, maxN)}`;
  }
  if (!listing.durationDays && listing.durationNights == null) return "";
  const { days, nights } = resolveDuration(listing);
  return formatDurationLabel(days, nights);
}

export function packageTierMetaLabel(pkg: ListingPackage) {
  const billing = PACKAGE_BILLING_LABELS[resolvePackageBilling(pkg)];
  const duration =
    pkg.durationDays != null || pkg.durationNights != null
      ? formatDurationLabel(
          Math.max(1, pkg.durationDays ?? (pkg.durationNights ?? 0) + 1),
          pkg.durationNights ?? Math.max(0, (pkg.durationDays ?? 1) - 1),
        )
      : "";
  return [duration, billing].filter(Boolean).join(" · ");
}

export function bookingPackageDetailLine(booking: Booking) {
  if (!booking.packageNameSnapshot) return "";
  const billing = booking.packageSnapshot
    ? PACKAGE_BILLING_LABELS[resolvePackageBilling(booking.packageSnapshot)]
    : "";
  const priceBit =
    booking.packagePriceSnapshot != null ? ` · ${peso(booking.packagePriceSnapshot)}` : "";
  const billingBit = billing ? ` ${billing.toLowerCase()}` : "";
  return `Package: ${booking.packageNameSnapshot}${priceBit}${billingBit}`.trim();
}

export function bookingPushSummary(booking: Booking) {
  const packageBit = booking.packageNameSnapshot ? `${booking.packageNameSnapshot} package for ` : "";
  const range = bookingDateRangeLabel(booking);
  const duration = bookingDurationLabel(booking);
  const packageDetail = bookingPackageDetailLine(booking);
  return [
    `${packageBit}${booking.listingTitle}`.trim(),
    packageDetail && packageDetail !== `Package: ${booking.packageNameSnapshot}`
      ? packageDetail
      : "",
    range,
    duration,
    `${booking.guests} guest${booking.guests === 1 ? "" : "s"}`,
    `Total: ${peso(booking.total)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function bookingPushBody(booking: Booking, lead: string) {
  const packageDetail = bookingPackageDetailLine(booking);
  const lines = [
    lead,
    packageDetail,
    bookingDateRangeLabel(booking),
    bookingDurationLabel(booking),
    `${booking.guests} guest${booking.guests === 1 ? "" : "s"} · ${peso(booking.total)}`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function eachYmd(start: string, end: string) {
  const out: string[] = [];
  let cursor = start.slice(0, 10);
  const last = end.slice(0, 10) || cursor;
  if (!cursor) return out;
  let guard = 0;
  while (cursor <= last && guard < 400) {
    out.push(cursor);
    cursor = addDaysYmd(cursor, 1);
    guard += 1;
  }
  return out;
}

export function weekStartMonday(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDaysYmd(ymd, offset);
}
