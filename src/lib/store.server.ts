/**
 * Compact app store for Cloudflare Worker / Node.
 * Durable state lives in the project's own Supabase instance (`hub_state` document),
 * with every booking mirrored into a real `bookings` table for admin visibility.
 * Revision bumps on every mutation so clients poll cheaply for realtime updates.
 */
import { destinations as seedDestinations, listings as seedListings } from "@/data/catalog";
import { isMainAdminEmail, MAIN_ADMIN_EMAIL, normalizeAccountName, normalizeEmail, REVENUE_RESET_CODE } from "@/lib/constants";
import { applyListingMapFlags, coordsForDestination, sameCoords, sanitizeCoords } from "@/lib/listing-map";
import {
  assertBookingFitsCapacity,
  bookingDateRangeLabel,
  bookingDurationLabel,
  bookingPushBody,
  bookingStartYmd,
  PACKAGE_BILLING_LABELS,
  quoteBooking,
  resolveListingPackages,
  resolvePackageBilling,
  resolvePricingType,
  seedTravelPackages,
  sortPackages,
} from "@/lib/booking-model";
import type {
  Booking,
  BookingStatus,
  NotifyPreference,
  Destination,
  HubAccount,
  HubSettings,
  HubNotification,
  Listing,
  ListingInput,
  ListingPackage,
  DestinationInput,
  ListingKind,
  PackageInput,
  PricingType,
  Review,
  Testimonial,
} from "@/lib/types";
import { isListingAvailable } from "@/lib/types";
import { peso } from "@/lib/utils";
import {
  deleteAccountRow,
  deleteAllBookingRows,
  deleteDemoBookingRows,
  deleteFavoriteRow,
  deleteFavoriteRowsForEmail,
  deleteListingRow,
  deleteTravelPackageRow,
  findBookingInHubDocument,
  listAccountRows,
  listAllBookingRows,
  listBookingRows,
  listBookingRowsByEmail,
  listBookingRowsByReference,
  listFavoriteListingIds,
  readAccountRow,
  readHubDocument,
  readHubRevision,
  supabaseConfigured,
  supabaseMissingConfigMessage,
  upsertAccountRow,
  upsertBookingRow,
  upsertFavoriteRow,
  upsertListingRow,
  upsertTravelPackageRow,
  writeHubDocument,
} from "@/lib/supabase-rest.server";
import { keepAlive } from "@/lib/worker-env";

export interface HubState {
  revision: number;
  listings: Listing[];
  bookings: Booking[];
  destinations: Destination[];
  /** Global reusable package catalog (Standard / Premium / Luxury + custom tiers). */
  packages: ListingPackage[];
  accounts: HubAccount[];
  adminInvites: string[];
  testimonials: Testimonial[];
  settings: HubSettings;
  notifications: HubNotification[];
  /** Saved listing ids keyed by traveller email. */
  favorites: Record<string, string[]>;
  /** ISO time of last full booking/revenue wipe — older reservations are ignored. */
  bookingsClearedAt?: string;
  /** Booking ids that already received the admin “1 day before” push (dedupe). */
  pushReminderSent?: string[];
  /** Booking ids that already received the “day of schedule” reminder (dedupe). */
  pushReminderDayOfSent?: string[];
  /** Booking ids that already received the admin “new booking” push (guest + registered). */
  pushBookingNewSent?: string[];
}

const GLOBAL_KEY = "__nexora_store_v1__";

type GlobalStore = typeof globalThis & {
  [GLOBAL_KEY]?: HubState;
};

export const defaultSettings: HubSettings = {
  contactAddress: "Palawan, Philippines",
  contactPhone: "+63 999 000 0000",
  contactMobile: "+63 999 000 0000",
  contactEmail: "sheethappenswithjaa@gmail.com",
  officeHours: "Daily · 7:00 AM – 9:00 PM (PHT)",
  bookingNotice:
    "Our team reviews every reservation manually. You will receive a call or text message once your booking is approved.",
  socialInstagram: "",
  socialTwitter: "",
  socialFacebook: "",
};

const SEED_REVIEW_IDS = new Set(["r1", "r2", "r3"]);
const DEMO_BOOKING_IDS = new Set(["b1", "b2", "b3", "b4", "b5"]);
const DEMO_BOOKING_REFERENCES = [
  "EXH-4821-COR",
  "EXH-7710-ELN",
  "EXH-2093-PPS",
  "EXH-5512-ELN",
  "EXH-3388-SVT",
];

function isDemoBooking(booking: Booking) {
  return DEMO_BOOKING_IDS.has(booking.id) || DEMO_BOOKING_REFERENCES.includes(booking.reference);
}

/** Ensure Standard / Premium / Luxury exist; never overwrite admin-edited catalog rows. */
function ensurePackageCatalog(existing?: ListingPackage[] | null): ListingPackage[] {
  const seeds = seedTravelPackages();
  if (!existing?.length) return seeds;
  const byId = new Map(existing.map((pkg) => [pkg.id, pkg]));
  const byName = new Map(existing.map((pkg) => [pkg.name.trim().toLowerCase(), pkg]));
  for (const seed of seeds) {
    const match = byId.get(seed.id) ?? byName.get(seed.name.toLowerCase());
    if (!match) {
      existing.push(seed);
      byId.set(seed.id, seed);
      continue;
    }
    // Soft-fill new tier fields on older seed rows without clobbering admin edits.
    if (match.durationDays == null && seed.durationDays != null) match.durationDays = seed.durationDays;
    if (match.durationNights == null && seed.durationNights != null) {
      match.durationNights = seed.durationNights;
    }
    if (!match.pricingType && seed.pricingType) match.pricingType = seed.pricingType;
  }
  return sortPackages(existing);
}

function normalizePackageInput(input: PackageInput, position: number, id?: string): ListingPackage {
  const name = input.name.trim();
  if (name.length < 1) throw new Error("Package name is required.");
  const days =
    input.durationDays == null ? undefined : Math.max(1, Math.round(Number(input.durationDays) || 1));
  const nights =
    input.durationNights == null
      ? days != null
        ? Math.max(0, days - 1)
        : undefined
      : Math.max(0, Math.round(Number(input.durationNights) || 0));
  return {
    id: id ?? crypto.randomUUID(),
    name,
    description: (input.description ?? "").trim(),
    price: Math.max(0, Math.round(Number(input.price) || 0)),
    inclusions: (input.inclusions ?? []).map((s) => s.trim()).filter(Boolean),
    exclusions: (input.exclusions ?? []).map((s) => s.trim()).filter(Boolean),
    guestLimit:
      input.guestLimit == null || Number(input.guestLimit) <= 0
        ? undefined
        : Math.max(1, Math.round(Number(input.guestLimit))),
    image: input.image?.trim() || undefined,
    active: input.active !== false,
    position: input.position ?? position,
    durationDays: days,
    durationNights: nights,
    pricingType: input.pricingType === "per_night" ? "per_night" : "per_person",
  };
}

function packageToRow(pkg: ListingPackage) {
  return {
    id: pkg.id,
    name: pkg.name,
    description: pkg.description ?? "",
    price: pkg.price,
    inclusions: pkg.inclusions ?? [],
    exclusions: pkg.exclusions ?? [],
    guest_limit: pkg.guestLimit ?? null,
    image: pkg.image ?? null,
    active: pkg.active !== false,
    position: pkg.position ?? 0,
    duration_days: pkg.durationDays ?? null,
    duration_nights: pkg.durationNights ?? null,
    pricing_type: pkg.pricingType ?? "per_person",
    updated_at: new Date().toISOString(),
  };
}

async function mirrorPackage(pkg: ListingPackage) {
  if (!supabaseConfigured()) return;
  try {
    await upsertTravelPackageRow(packageToRow(pkg));
  } catch (error) {
    console.error("[packages] supabase upsert failed", error);
  }
}

async function mirrorAllPackages(packages: ListingPackage[]) {
  if (!supabaseConfigured()) return;
  for (const pkg of packages) {
    await mirrorPackage(pkg);
  }
}

/** Attach resolved catalog packages onto listings for checkout / public display. */
function hydrateListingFromCatalog(listing: Listing, catalog: ListingPackage[]) {
  if (resolvePricingType(listing) !== "per_package") return;
  const resolved = resolveListingPackages(listing, catalog);
  listing.packages = resolved.map((pkg) => ({
    ...pkg,
    inclusions: [...(pkg.inclusions ?? [])],
    exclusions: [...(pkg.exclusions ?? [])],
  }));
  if (!listing.packageIds?.length && resolved.length) {
    listing.packageIds = resolved.map((pkg) => pkg.id);
  }
}

function hydrateAllListingPackages(state: HubState) {
  state.packages = ensurePackageCatalog(state.packages);
  for (const listing of state.listings) {
    hydrateListingFromCatalog(listing, state.packages);
  }
}

/** Strip demo reservations shipped with early seeds. */
function sanitizeDemoBookings(bookings: Booking[]) {
  return bookings.filter((b) => !isDemoBooking(b));
}

/** Drop reservations that existed before the last admin reset. */
function bookingsAfterReset(bookings: Booking[], clearedAt?: string) {
  if (!clearedAt) return bookings;
  const cut = new Date(clearedAt).getTime();
  if (Number.isNaN(cut)) return bookings;
  return bookings.filter((b) => {
    const created = new Date(b.createdAt ?? 0).getTime();
    return !Number.isNaN(created) && created > cut;
  });
}

function optStr(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function optNum(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function parsePackageSnapshot(value: unknown): ListingPackage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const pkg = value as Record<string, unknown>;
  const name = String(pkg.name ?? "");
  if (!name) return undefined;
  return {
    id: String(pkg.id ?? ""),
    name,
    description: String(pkg.description ?? ""),
    price: Number(pkg.price ?? 0) || 0,
    inclusions: Array.isArray(pkg.inclusions) ? pkg.inclusions.map(String) : [],
    exclusions: Array.isArray(pkg.exclusions) ? pkg.exclusions.map(String) : [],
    guestLimit: typeof pkg.guestLimit === "number" ? pkg.guestLimit : undefined,
    image: typeof pkg.image === "string" ? pkg.image : undefined,
    active: pkg.active !== false,
    position: Number(pkg.position ?? 0) || 0,
  };
}

function rowToBooking(row: Record<string, unknown>, listings: Listing[]): Booking {
  const listingId = String(row["listing_id"] ?? row["listingId"] ?? "");
  const listing = listings.find((l) => l.id === listingId);
  const date = String(row["date"] ?? row["start_date"] ?? row["startDate"] ?? "");
  const startDate = optStr(row, "startDate", "start_date") ?? date;
  const snapshotRaw = row["packageSnapshot"] ?? row["package_snapshot"];
  const packageSnapshot =
    typeof snapshotRaw === "string"
      ? parsePackageSnapshot((() => {
          try {
            return JSON.parse(snapshotRaw);
          } catch {
            return null;
          }
        })())
      : parsePackageSnapshot(snapshotRaw);
  const pricing = optStr(row, "pricingType", "pricing_type") as PricingType | undefined;
  return {
    id: String(row["id"]),
    reference: String(row["reference"] ?? ""),
    listingId,
    listingTitle: String(row["listing_title"] ?? row["listingTitle"] ?? ""),
    kind: String(row["kind"] ?? "tour") as ListingKind,
    image: String(row["image"] ?? listing?.images[0] ?? ""),
    guests: Number(row["guests"] ?? 1),
    date,
    startDate,
    startTime: optStr(row, "startTime", "start_time"),
    endDate: optStr(row, "endDate", "end_date") ?? startDate,
    endTime: optStr(row, "endTime", "end_time"),
    durationDays: optNum(row, "durationDays", "duration_days"),
    durationNights: optNum(row, "durationNights", "duration_nights"),
    pricingType:
      pricing === "per_person" || pricing === "per_night" || pricing === "per_package"
        ? pricing
        : undefined,
    packageId: optStr(row, "packageId", "package_id"),
    packageNameSnapshot: optStr(row, "packageNameSnapshot", "package_name"),
    packagePriceSnapshot: optNum(row, "packagePriceSnapshot", "package_price"),
    packageSnapshot,
    subtotal: optNum(row, "subtotal"),
    total: Number(row["total"] ?? 0),
    status: String(row["status"] ?? "pending") as BookingStatus,
    paid: Boolean(row["paid"]),
    paymentMethod:
      (row["payment_method"] as string | null | undefined) ??
      (row["paymentMethod"] as string | undefined),
    paidAt: (row["paid_at"] as string | null | undefined) ?? (row["paidAt"] as string | undefined),
    customer: String(row["customer"] ?? ""),
    customerEmail: (row["customer_email"] as string | null | undefined) ?? (row["customerEmail"] as string | undefined),
    customerPhone: (row["customer_phone"] as string | null | undefined) ?? (row["customerPhone"] as string | undefined),
    notifyPreference: (row["notify_preference"] as NotifyPreference | null | undefined) ?? (row["notifyPreference"] as NotifyPreference | undefined),
    guestCheckout: Boolean(row["guest_checkout"] ?? row["guestCheckout"]),
    createdAt: String(row["created_at"] ?? row["createdAt"] ?? ""),
    statusUpdatedAt: (row["status_updated_at"] as string | null | undefined) ?? (row["statusUpdatedAt"] as string | undefined),
    approvedAt: (row["approved_at"] as string | null | undefined) ?? (row["approvedAt"] as string | undefined),
    rejectedAt: (row["rejected_at"] as string | null | undefined) ?? (row["rejectedAt"] as string | undefined),
    statusBy: (row["status_by"] as string | null | undefined) ?? (row["statusBy"] as string | undefined),
    adminNote: (row["admin_note"] as string | null | undefined) ?? (row["adminNote"] as string | undefined),
  };
}

function mapBookingToFeed(booking: Booking) {
  return {
    id: booking.id,
    reference: booking.reference,
    listingTitle: booking.listingTitle,
    customer: booking.customer,
    customerEmail: booking.customerEmail,
    customerPhone: booking.customerPhone,
    guestCheckout: booking.guestCheckout,
    guests: booking.guests,
    date: booking.date,
    startDate: booking.startDate,
    startTime: booking.startTime,
    endDate: booking.endDate,
    endTime: booking.endTime,
    durationDays: booking.durationDays,
    durationNights: booking.durationNights,
    pricingType: booking.pricingType,
    packageNameSnapshot: booking.packageNameSnapshot,
    total: booking.total,
    status: booking.status,
    adminNote: booking.adminNote,
    createdAt: booking.createdAt ?? "",
    statusUpdatedAt: booking.statusUpdatedAt,
  };
}

function sortBookingsNewestFirst(bookings: Booking[]) {
  return [...bookings].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
  );
}

/** Timestamp used to decide which copy of a reservation is newer. */
function bookingFreshness(booking: Booking) {
  return (
    Date.parse(booking.statusUpdatedAt ?? booking.createdAt ?? "") ||
    Date.parse(booking.createdAt ?? "") ||
    0
  );
}

/**
 * Merge-on-write guard: union reservations/notifications that OTHER worker
 * isolates persisted while this isolate was working. Cloudflare isolates each
 * keep an in-memory copy of the hub document and persist the WHOLE document on
 * every mutation — without this union, a stale isolate silently erases guest
 * reservations made elsewhere (bookings going missing from the admin console).
 */
function mergeRemoteIntoState(
  state: HubState,
  remote: Partial<HubState>,
  remoteRevision = 0,
) {
  if (Array.isArray(remote.bookings)) {
    const byId = new Map(state.bookings.map((b) => [b.id, b]));
    const cut = state.bookingsClearedAt
      ? new Date(state.bookingsClearedAt).getTime()
      : 0;
    for (const raw of remote.bookings) {
      if (!raw || typeof raw !== "object") continue;
      const incoming = rowToBooking(raw as unknown as Record<string, unknown>, state.listings);
      if (!incoming.id) continue;
      if (cut && bookingFreshness(incoming) <= cut) continue; // respect revenue resets
      const current = byId.get(incoming.id);
      if (!current || bookingFreshness(incoming) > bookingFreshness(current)) {
        byId.set(incoming.id, incoming);
      }
    }
    state.bookings = sanitizeDemoBookings([...byId.values()]);
  }
  if (Array.isArray(remote.notifications) && remote.notifications.length) {
    const seen = new Set(state.notifications.map((n) => n.id));
    for (const notification of remote.notifications) {
      if (notification?.id && !seen.has(notification.id)) {
        state.notifications.push(notification);
        seen.add(notification.id);
      }
    }
  }
  // Adopt admin-managed settings that ANOTHER isolate persisted after our last
  // sync. state.revision was already incremented for our pending write, so
  // "remoteRevision > state.revision - 1" means someone else wrote since we
  // last synced. Without this, a stale isolate rewrites the whole hub document
  // and silently reverts admin edits (e.g. contact details "resetting"
  // themselves back to the defaults in the footer).
  if (remote.settings && remoteRevision > state.revision - 1) {
    state.settings = { ...defaultSettings, ...remote.settings };
  }
}

/** Merge hub document bookings with Supabase table rows (table wins on id conflict). */
async function mergeAllBookings(): Promise<Booking[]> {
  await ensureStore();
  await refreshStoreBookings();
  const state = getMemory();
  const merged = new Map<string, Booking>();

  for (const booking of bookingsAfterReset(
    sanitizeDemoBookings(state.bookings),
    state.bookingsClearedAt,
  )) {
    merged.set(booking.id, booking);
  }

  if (supabaseConfigured()) {
    let clearedAt = state.bookingsClearedAt;
    try {
      const doc = await readHubDocument<Partial<HubState>>();
      if (doc?.data?.bookingsClearedAt) clearedAt = doc.data.bookingsClearedAt;
      const hubBookings = doc?.data?.bookings ?? [];
      for (const raw of hubBookings) {
        if (!raw || typeof raw !== "object") continue;
        const booking = rowToBooking(raw as unknown as Record<string, unknown>, state.listings);
        merged.set(booking.id, booking);
      }
    } catch {
      // hub document unavailable
    }

    try {
      const rows = await listAllBookingRows();
      for (const row of rows) {
        const booking = rowToBooking(row, state.listings);
        merged.set(booking.id, booking);
      }
    } catch {
      // bookings table unavailable
    }

    return sortBookingsNewestFirst(
      bookingsAfterReset(Array.from(merged.values()), clearedAt),
    );
  }

  return sortBookingsNewestFirst(Array.from(merged.values()));
}

async function backfillBookingsTable(bookings: Booking[]) {
  if (!supabaseConfigured() || !bookings.length) return;
  keepAlive(
    (async () => {
      let clearedAt = getMemory().bookingsClearedAt;
      try {
        const doc = await readHubDocument<Partial<HubState>>();
        if (doc?.data?.bookingsClearedAt) clearedAt = doc.data.bookingsClearedAt;
      } catch {
        // keep local watermark
      }
      const fresh = bookingsAfterReset(bookings, clearedAt);
      for (const booking of fresh) {
        await mirrorBooking(booking);
      }
    })().catch(() => undefined),
  );
}

/** Drop demo review bundles shipped with the seed catalog. */
function sanitizeSeedReviews(listings: Listing[]) {
  for (const listing of listings) {
    const reviews = listing.reviews ?? [];
    if (reviews.length && reviews.every((r) => SEED_REVIEW_IDS.has(r.id))) {
      listing.reviews = [];
      listing.rating = 0;
      listing.reviewCount = 0;
    }
  }
}

function recalculateListingRating(listing: Listing) {
  const reviews = listing.reviews ?? [];
  if (!reviews.length) {
    listing.rating = 0;
    listing.reviewCount = 0;
    return;
  }
  listing.reviewCount = reviews.length;
  listing.rating =
    Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10;
}

function pushNotification(
  state: HubState,
  input: Omit<HubNotification, "id" | "read" | "createdAt">,
) {
  if (!state.notifications) state.notifications = [];
  state.notifications.unshift({
    id: crypto.randomUUID(),
    read: false,
    createdAt: new Date().toISOString(),
    ...input,
    email: normalizeEmail(input.email),
  });
  if (state.notifications.length > 200) state.notifications.length = 200;
}

function adminEmails(state: HubState): string[] {
  const emails = state.accounts
    .filter((a) => a.role === "admin")
    .map((a) => normalizeEmail(a.email));
  emails.push(normalizeEmail(MAIN_ADMIN_EMAIL));
  return [...new Set(emails.filter((e) => e.includes("@")))];
}

function telegramAlertFromBooking(
  booking: Booking,
  adminUrl: string,
  extra?: { note?: string },
) {
  const packageBilling = booking.packageSnapshot
    ? resolvePackageBilling(booking.packageSnapshot)
    : undefined;
  return {
    reference: booking.reference,
    listingTitle: booking.listingTitle,
    kind: booking.kind,
    customer: booking.customer,
    customerEmail: booking.customerEmail,
    customerPhone: booking.customerPhone,
    date: booking.date,
    startDate: booking.startDate,
    startTime: booking.startTime,
    endDate: booking.endDate,
    endTime: booking.endTime,
    durationDays: booking.durationDays,
    durationNights: booking.durationNights,
    guests: booking.guests,
    total: booking.total,
    pricingType: booking.pricingType,
    packageName: booking.packageNameSnapshot,
    packagePrice: booking.packagePriceSnapshot,
    packageBilling,
    packageInclusions: booking.packageSnapshot?.inclusions,
    status: booking.status,
    note: extra?.note ?? booking.adminNote,
    adminUrl,
  };
}

function kindLabel(kind: string) {
  if (kind === "stay") return "stay";
  if (kind === "restaurant") return "dining";
  if (kind === "package") return "package";
  return "tour";
}

/** One admin push when a tourist account is created (email or Google). */
async function notifyAdminsNewCustomer(
  state: HubState,
  account: { name: string; email: string; role: string; createdAt: string },
  via: "email" | "google",
) {
  if (account.role !== "tourist") return;
  const { absoluteUrl, queuePushToAdmins } = await import("@/lib/onesignal.server");
  await queuePushToAdmins(adminEmails(state), {
    title: "New customer registered",
    body: `${account.name} (${account.email}) just ${
      via === "google" ? "signed up with Google" : "created a Nexora account"
    }.`,
    url: absoluteUrl("/admin"),
    idempotencyKey: `admin-new-user-${account.email}-${account.createdAt}`,
  });
}

/** Calendar date (YYYY-MM-DD) in Asia/Manila for “served soon” reminders. */
function manilaYmd(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  if (!y || !m || !d) return new Date().toISOString().slice(0, 10);
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}

function markPushBookingNewSent(state: HubState, bookingId: string) {
  if (!state.pushBookingNewSent) state.pushBookingNewSent = [];
  if (!state.pushBookingNewSent.includes(bookingId)) {
    state.pushBookingNewSent.push(bookingId);
  }
  if (state.pushBookingNewSent.length > 500) {
    state.pushBookingNewSent = state.pushBookingNewSent.slice(-400);
  }
}

/**
 * Admin push for every booking that appears in the Admin Bookings feed —
 * guest (not registered) and registered alike. Safe from keepalive; dedupes via
 * `pushBookingNewSent`. Uses the same booking list admins see, not account signup.
 */
export async function processNewBookingAdminPushes() {
  const state = await ensureStore();
  const bookings = await mergeAllBookings();
  if (!state.pushBookingNewSent) state.pushBookingNewSent = [];

  // Retry window for createBookingRecord pushes that returned 0 recipients (e.g. admin not subscribed yet / cold worker).
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  const pending = bookings
    .filter((b) => {
      if (state.pushBookingNewSent!.includes(b.id)) return false;
      const created = Date.parse(b.createdAt || "");
      // Require a valid createdAt so we never mass-notify the entire history.
      if (!Number.isFinite(created)) return false;
      return created >= cutoff;
    })
    .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))
    .slice(0, 10);
  if (!pending.length) return { sent: 0, pending: 0 };

  const { absoluteUrl, sendPushToAdmins, deliverPushSafely } = await import("@/lib/onesignal.server");
  const admins = adminEmails(state);
  let sent = 0;
  for (const booking of pending) {
    const guest = !booking.customerEmail
      ? "guest"
      : state.accounts.some((a) => normalizeEmail(a.email) === normalizeEmail(booking.customerEmail!))
        ? "registered"
        : "guest";
    const result = await deliverPushSafely(`booking-retry-${booking.id}`, () =>
      sendPushToAdmins(admins, {
        title: "New booking",
        body: `${booking.customer} reserved ${booking.listingTitle} (${booking.reference}) · ${bookingDateRangeLabel(booking)} [${guest}].`,
        url: absoluteUrl("/admin"),
        idempotencyKey: `booking-new-${booking.id}`,
      }),
    );
    if (result && result.recipients > 0) {
      markPushBookingNewSent(state, booking.id);
      sent += 1;
    }
  }
  if (sent > 0) await bumpAndWait(state);
  return { sent, pending: pending.length };
}

/**
 * Schedule reminders for approved bookings (Manila calendar):
 * - 1 day before → OneSignal admins + Telegram reminders group
 * - On the booking date → Telegram reminders group (+ OneSignal)
 * Safe to call from keepalive — dedupes via pushReminderSent / pushReminderDayOfSent.
 */
export async function processBookingDayBeforeReminders() {
  const state = await ensureStore();
  const bookings = await mergeAllBookings();
  const tomorrow = manilaYmd(1);
  const today = manilaYmd(0);
  if (!state.pushReminderSent) state.pushReminderSent = [];
  if (!state.pushReminderDayOfSent) state.pushReminderDayOfSent = [];

  const isApprovedSchedule = (status: Booking["status"]) =>
    status === "approved" || status === "confirmed";

  const dueTomorrow = bookings.filter(
    (b) =>
      isApprovedSchedule(b.status) &&
      bookingStartYmd(b) === tomorrow &&
      !state.pushReminderSent!.includes(b.id),
  );
  const dueToday = bookings.filter(
    (b) =>
      isApprovedSchedule(b.status) &&
      bookingStartYmd(b) === today &&
      !state.pushReminderDayOfSent!.includes(b.id),
  );

  if (!dueTomorrow.length && !dueToday.length) {
    return { sent: 0, dayBefore: 0, dayOf: 0, tomorrow, today };
  }

  const { absoluteUrl, sendPushToAdmins, deliverPushSafely } = await import(
    "@/lib/onesignal.server"
  );
  const { notifyBookingReminderTelegram, deliverTelegramSafely } = await import(
    "@/lib/telegram.server"
  );
  const admins = adminEmails(state);
  let dayBefore = 0;
  let dayOf = 0;

  for (const booking of dueTomorrow) {
    const alert = telegramAlertFromBooking(booking, absoluteUrl("/admin"));
    await deliverPushSafely(`booking-reminder-eve-${booking.id}`, () =>
      sendPushToAdmins(admins, {
        title: "Booking tomorrow",
        body: `${booking.listingTitle} (${booking.reference}) for ${booking.customer} starts tomorrow.\n${bookingDateRangeLabel(booking)}`,
        url: absoluteUrl("/admin"),
        idempotencyKey: `booking-soon-${booking.id}`,
      }),
    );
    const tg = await deliverTelegramSafely(`booking-reminder-eve-tg-${booking.id}`, () =>
      notifyBookingReminderTelegram(alert, "day-before"),
    );
    state.pushReminderSent.push(booking.id);
    if (tg) dayBefore += 1;
  }

  for (const booking of dueToday) {
    const alert = telegramAlertFromBooking(booking, absoluteUrl("/admin"));
    await deliverPushSafely(`booking-reminder-day-${booking.id}`, () =>
      sendPushToAdmins(admins, {
        title: "Booking today",
        body: `${booking.listingTitle} (${booking.reference}) for ${booking.customer} starts today.\n${bookingDateRangeLabel(booking)}`,
        url: absoluteUrl("/admin"),
        idempotencyKey: `booking-today-${booking.id}`,
      }),
    );
    const tg = await deliverTelegramSafely(`booking-reminder-day-tg-${booking.id}`, () =>
      notifyBookingReminderTelegram(alert, "day-of"),
    );
    state.pushReminderDayOfSent.push(booking.id);
    if (tg) dayOf += 1;
  }

  if (state.pushReminderSent.length > 500) {
    state.pushReminderSent = state.pushReminderSent.slice(-400);
  }
  if (state.pushReminderDayOfSent.length > 500) {
    state.pushReminderDayOfSent = state.pushReminderDayOfSent.slice(-400);
  }
  await bumpAndWait(state);
  return {
    sent: dayBefore + dayOf,
    dayBefore,
    dayOf,
    tomorrow,
    today,
  };
}

function recountDestinationListings(destinations: Destination[], listings: Listing[]) {
  for (const dest of destinations) {
    const key = dest.name.trim().toLowerCase();
    dest.listings = listings.filter(
      (l) => l.status === "approved" && l.destination.trim().toLowerCase() === key,
    ).length;
    dest.coords = sanitizeCoords(dest.coords) ?? coordsForDestination(dest.name, destinations);
  }
}

function normalizeListingMaps(listings: Listing[], destinations?: Destination[]) {
  for (const listing of listings) {
    applyListingMapFlags(listing);
    listing.coords =
      sanitizeCoords(listing.coords) ?? coordsForDestination(listing.destination, destinations);
  }
}

const FALLBACK_DESTINATION_IMAGE =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="960"><rect fill="#0b2b2b" width="100%" height="100%"/><text x="50%" y="50%" fill="#c9a96e" font-size="36" text-anchor="middle" dy=".3em">Nexora</text></svg>',
  );

function ensureDestinationForName(
  destinations: Destination[],
  name: string,
  country?: string,
  coords?: { lat: number; lng: number } | null,
) {
  const trimmed = name.trim();
  if (trimmed.length < 2) return;
  const key = trimmed.toLowerCase();
  const existing = destinations.find((d) => d.name.trim().toLowerCase() === key);
  if (existing) {
    if (!sanitizeCoords(existing.coords)) {
      existing.coords = sanitizeCoords(coords) ?? coordsForDestination(trimmed, destinations);
    }
    return existing;
  }
  const destination: Destination = {
    id: crypto.randomUUID(),
    name: trimmed,
    country: country?.trim() || "Palawan",
    tagline: "",
    image: FALLBACK_DESTINATION_IMAGE,
    listings: 0,
    coords: sanitizeCoords(coords) ?? coordsForDestination(trimmed, destinations),
  };
  destinations.push(destination);
  return destination;
}

function syncDestinationsFromListings(destinations: Destination[], listings: Listing[]) {
  for (const listing of listings) {
    ensureDestinationForName(destinations, listing.destination, listing.country, listing.coords);
  }
}

function emptySeed(): HubState {
  const listings = structuredClone(seedListings);
  sanitizeSeedReviews(listings);
  const destinations = structuredClone(seedDestinations);
  syncDestinationsFromListings(destinations, listings);
  normalizeListingMaps(listings, destinations);
  recountDestinationListings(destinations, listings);
  return {
    revision: 1,
    listings,
    bookings: [],
    destinations,
    packages: seedTravelPackages(),
    accounts: [],
    adminInvites: [],
    testimonials: [],
    settings: { ...defaultSettings },
    notifications: [],
    favorites: {},
    pushReminderSent: [],
    pushReminderDayOfSent: [],
    pushBookingNewSent: [],
  };
}

function getMemory(): HubState {
  const g = globalThis as GlobalStore;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = emptySeed();
  return g[GLOBAL_KEY]!;
}

let hydratePromise: Promise<void> | null = null;

function applyRemote(parsed: Partial<HubState> | null) {
  if (!parsed?.listings) return;
  const listings = structuredClone(parsed.listings);
  sanitizeSeedReviews(listings);
  const destinations = parsed.destinations?.length
    ? parsed.destinations
    : structuredClone(seedDestinations);
  syncDestinationsFromListings(destinations, listings);
  normalizeListingMaps(listings, destinations);
  const next: HubState = {
    revision: parsed.revision ?? 1,
    listings,
    bookings: sanitizeDemoBookings(parsed.bookings ?? []),
    destinations,
    packages: ensurePackageCatalog(parsed.packages),
    accounts: parsed.accounts ?? [],
    adminInvites: (parsed.adminInvites ?? []).map(normalizeEmail),
    testimonials: parsed.testimonials ?? [],
    settings: { ...defaultSettings, ...(parsed.settings ?? {}) },
    notifications: parsed.notifications ?? [],
    favorites: parsed.favorites ?? {},
    bookingsClearedAt: parsed.bookingsClearedAt,
    pushReminderSent: parsed.pushReminderSent ?? [],
    pushReminderDayOfSent: parsed.pushReminderDayOfSent ?? [],
    pushBookingNewSent: parsed.pushBookingNewSent ?? [],
  };
  const g = globalThis as GlobalStore;
  const current = g[GLOBAL_KEY];
  if (current) {
    // Mutate IN PLACE. Replacing the object would orphan every outstanding
    // reference (e.g. createBookingRecord's `state`): mutations made after a
    // refresh land on the stale copy and persistToRemote() — which re-reads
    // getMemory() — silently drops them. This exact race is what made new
    // reservations (guest AND registered) vanish without a trace.
    Object.assign(current, next);
  } else {
    g[GLOBAL_KEY] = next;
  }
  recountDestinationListings(g[GLOBAL_KEY]!.destinations, g[GLOBAL_KEY]!.listings);
  hydrateAllListingPackages(g[GLOBAL_KEY]!);
}

async function purgeDemoBookingsEverywhere(state: HubState) {
  const beforeIds = state.bookings.map((b) => b.id).sort().join(",");
  state.bookings = sanitizeDemoBookings(state.bookings);
  let changed = beforeIds !== state.bookings.map((b) => b.id).sort().join(",");

  if (supabaseConfigured()) {
    try {
      await deleteDemoBookingRows(DEMO_BOOKING_REFERENCES);
    } catch {
      // Non-fatal — hub document cleanup still runs.
    }
    try {
      const rows = await listAllBookingRows();
      const synced = bookingsAfterReset(
        rows.map((row) => rowToBooking(row, state.listings)),
        state.bookingsClearedAt,
      );
      const merged = new Map(state.bookings.map((b) => [b.id, b]));
      for (const booking of synced) merged.set(booking.id, booking);
      const mergedList = sanitizeDemoBookings(
        bookingsAfterReset(Array.from(merged.values()), state.bookingsClearedAt),
      );
      const mergedIds = mergedList.map((b) => b.id).sort().join(",");
      if (mergedIds !== state.bookings.map((b) => b.id).sort().join(",")) {
        state.bookings = mergedList;
        changed = true;
      }
    } catch {
      // Bookings table unavailable — keep hub document rows intact.
    }
  }

  if (changed) {
    state.revision += 1;
    await persistToRemote();
  }
}

async function hydrateFromRemote() {
  if (!supabaseConfigured()) return;
  try {
    const doc = await readHubDocument<Partial<HubState>>();
    if (doc) {
      applyRemote({ ...doc.data, revision: doc.revision });
      await purgeDemoBookingsEverywhere(getMemory());
    } else {
      // First boot against an empty database — publish the seed once.
      const state = getMemory();
      state.bookings = [];
      await writeHubDocument(state, state.revision);
    }
  } catch {
    // Table missing or network hiccup — memory seed still serves the app.
  }
}

async function persistToRemote() {
  if (!supabaseConfigured()) return;
  const state = getMemory();
  // Merge-on-write: adopt reservations/notifications written by other isolates
  // since this one hydrated, then write the union. Prevents a stale worker from
  // overwriting the shared document and wiping newer guest bookings.
  try {
    const doc = await readHubDocument<Partial<HubState>>();
    if (doc?.data) {
      mergeRemoteIntoState(state, doc.data, doc.revision ?? 0);
      if ((doc.revision ?? 0) >= state.revision) {
        state.revision = (doc.revision ?? 0) + 1;
      }
    }
  } catch {
    // Document unreadable — persist local state as-is rather than dropping mutations.
  }
  await writeHubDocument(state, state.revision);
}

/** Re-hydrate from the hub document at most this often (per isolate). */
const HYDRATE_TTL_MS = 30_000;
let lastHydratedAt = 0;

export async function ensureStore(): Promise<HubState> {
  // Hydrate once on cold start, then refresh periodically. Isolates live a
  // long time (the keepalive cron keeps them warm), and hydrating only once
  // meant an isolate could serve pre-edit settings forever after an admin
  // saved changes on a different isolate.
  if (!hydratePromise || Date.now() - lastHydratedAt > HYDRATE_TTL_MS) {
    hydratePromise = hydrateFromRemote().finally(() => {
      lastHydratedAt = Date.now();
    });
  }
  await hydratePromise;
  return getMemory();
}

function bump(state: HubState) {
  state.revision += 1;
  // Cloudflare Workers freeze the isolate when the response is sent, so a
  // delayed setTimeout write often never runs. Persist now and keepAlive.
  keepAlive(persistToRemote().catch(() => undefined));
}

async function bumpAndWait(state: HubState) {
  state.revision += 1;
  if (supabaseConfigured()) await persistToRemote();
}

export async function getRevision() {
  const state = await ensureStore();
  if (supabaseConfigured()) {
    try {
      const remote = await readHubRevision();
      // Another worker isolate (or another device) mutated state — pull it in.
      if (remote !== null && remote > state.revision) {
        const doc = await readHubDocument<Partial<HubState>>();
        if (doc) applyRemote({ ...doc.data, revision: doc.revision });
        return getMemory().revision;
      }
    } catch {
      // Ignore: fall back to the local revision.
    }
  }
  return state.revision;
}

export async function getSnapshot() {
  const state = await ensureStore();
  await getRevision();
  const current = getMemory();
  const hadPackages = (current.packages?.length ?? 0) > 0;
  current.packages = ensurePackageCatalog(current.packages);
  hydrateAllListingPackages(current);
  normalizeListingMaps(current.listings);
  if (!hadPackages && current.packages.length) {
    await bumpAndWait(current);
    await mirrorAllPackages(current.packages);
  }
  return current;
}

export async function getSettings(): Promise<HubSettings> {
  const state = await ensureStore();
  return { ...defaultSettings, ...state.settings };
}

export async function updateSettings(actorEmail: string, patch: Partial<HubSettings>) {
  const state = await assertAdmin(actorEmail);
  state.settings = { ...defaultSettings, ...state.settings, ...patch };
  // Persist before responding so a saved change is durable even if this
  // isolate freezes right after the response (bump() is fire-and-forget).
  await bumpAndWait(state);
  return state.settings;
}


export function resolveRole(
  email: string,
  invites: string[],
  existingRole?: "tourist" | "admin",
): "tourist" | "admin" {
  const e = normalizeEmail(email);
  if (isMainAdminEmail(e)) return "admin";
  if (invites.includes(e)) return "admin";
  // Keep invited admins after the invite row is consumed on first sign-in.
  if (existingRole === "admin") return "admin";
  return "tourist";
}

function roleForState(state: HubState, email: string): "tourist" | "admin" {
  const e = normalizeEmail(email);
  const existing = state.accounts.find((a) => a.email === e)?.role;
  return resolveRole(e, state.adminInvites, existing);
}

const HASH_PEPPERS = ["nexora:", "explorehub:"] as const;

export async function hashPassword(password: string, pepper: string = HASH_PEPPERS[0]) {
  const data = new TextEncoder().encode(`${pepper}${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function passwordMatches(password: string, storedHash: string) {
  if (!storedHash) return false;
  for (const pepper of HASH_PEPPERS) {
    if ((await hashPassword(password, pepper)) === storedHash) return true;
  }
  return false;
}

function accountFromRow(row: Record<string, unknown>): HubAccount | null {
  const email = normalizeEmail(String(row.email ?? ""));
  if (!email) return null;
  const notify = row.notify_preference;
  return {
    email,
    name: String(row.name ?? email.split("@")[0]),
    passwordHash: typeof row.password_hash === "string" ? row.password_hash : "",
    role: row.role === "admin" ? "admin" : "tourist",
    picture: typeof row.picture === "string" && row.picture ? row.picture : undefined,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    notifyPreference:
      notify === "call" || notify === "sms" || notify === "email" || notify === "any"
        ? notify
        : undefined,
    contactNumber:
      typeof row.contact_number === "string" && row.contact_number
        ? row.contact_number
        : undefined,
  };
}

function rememberAccount(account: HubAccount) {
  const state = getMemory();
  const idx = state.accounts.findIndex((row) => row.email === account.email);
  if (idx >= 0) {
    const previous = state.accounts[idx];
    state.accounts[idx] = {
      ...previous,
      ...account,
      passwordHash: account.passwordHash || previous.passwordHash,
    };
    return state.accounts[idx];
  }
  state.accounts.push(account);
  return account;
}

function mergeAccounts(
  email: string,
  ...candidates: (HubAccount | null | undefined)[]
): HubAccount | undefined {
  const present = candidates.filter(Boolean) as HubAccount[];
  if (!present.length) return undefined;
  const passwordHash = present.find((a) => a.passwordHash)?.passwordHash ?? "";
  const base = present[0];
  return {
    email,
    name: present.find((a) => a.name)?.name ?? email.split("@")[0],
    passwordHash,
    role: present.some((a) => a.role === "admin") ? "admin" : (base.role ?? "tourist"),
    picture: present.find((a) => a.picture)?.picture,
    createdAt: present.find((a) => a.createdAt)?.createdAt ?? new Date().toISOString(),
    notifyPreference: present.find((a) => a.notifyPreference)?.notifyPreference,
    contactNumber: present.find((a) => a.contactNumber)?.contactNumber,
  };
}

/** Pull the accounts table first (cross-device credentials), then hub_state for profile data. */
async function findAccount(email: string): Promise<HubAccount | undefined> {
  await ensureStore();
  const normalized = normalizeEmail(email);

  let fromTable: HubAccount | null = null;
  if (supabaseConfigured()) {
    try {
      const row = await readAccountRow(normalized);
      if (row) fromTable = accountFromRow(row);
    } catch {
      // Fall through to hub_state.
    }
  }

  if (supabaseConfigured()) {
    try {
      const doc = await readHubDocument<Partial<HubState>>();
      if (doc) {
        const memory = getMemory();
        const local = memory.accounts.find((account) => account.email === normalized);
        const remote = doc.data.accounts?.find((account) => account.email === normalized);
        const shouldApplyRemote =
          doc.revision >= memory.revision ||
          !local ||
          Boolean(remote?.passwordHash && !local.passwordHash);
        if (shouldApplyRemote) {
          applyRemote({ ...doc.data, revision: doc.revision });
        }
      }
    } catch {
      // Fall through to in-memory merge.
    }
  }

  const local = getMemory().accounts.find((account) => account.email === normalized);
  const merged = mergeAccounts(normalized, fromTable ?? undefined, local);
  if (!merged) return undefined;
  merged.role = resolveRole(normalized, getMemory().adminInvites, merged.role);
  return rememberAccount(merged);
}

/** Resolve a signed-in user profile from Supabase + hub_state (for session cookies). */
export async function lookupAccountForSession(email: string) {
  const account = await findAccount(normalizeEmail(email));
  if (!account) return null;
  return {
    name: account.name,
    email: account.email,
    role: account.role,
    picture: account.picture,
  };
}

function slugify(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 72);
}

export async function registerAccount(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ ok: true; account: Omit<HubAccount, "passwordHash"> } | { ok: false; error: string }> {
  if (!supabaseConfigured()) {
    return { ok: false, error: supabaseMissingConfigMessage() };
  }
  const state = await ensureStore();
  const email = normalizeEmail(input.email);
  const existing = await findAccount(email);

  // Only block when the accounts table already has a saved password.
  if (existing?.passwordHash && supabaseConfigured()) {
    try {
      const row = await readAccountRow(email);
      if (typeof row?.password_hash === "string" && row.password_hash.length > 0) {
        return { ok: false, error: "An account with this email already exists. Sign in instead." };
      }
    } catch {
      // Table unreadable — allow completing a partial registration below.
    }
  }

  const role = resolveRole(email, state.adminInvites, existing?.role);
  const account: HubAccount = {
    email,
    name: normalizeAccountName(input.name) || existing?.name || email.split("@")[0],
    passwordHash: await hashPassword(input.password),
    role,
    picture: existing?.picture,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    notifyPreference: existing?.notifyPreference,
    contactNumber: existing?.contactNumber,
  };

  rememberAccount(account);
  if (role === "admin" && !isMainAdminEmail(email)) {
    state.adminInvites = state.adminInvites.filter((e) => e !== email);
  }

  // Prefer hub_state; fall back to the accounts table if the document write fails.
  let saved = false;
  try {
    await bumpAndWait(state);
    saved = true;
  } catch {
    // hub_state unavailable — try the accounts table directly.
  }
  if (!saved) {
    try {
      await mirrorAccount(account, true);
      saved = true;
    } catch {
      return { ok: false, error: "Could not save your account. Try again." };
    }
  } else {
    try {
      await mirrorAccount(account, true);
    } catch {
      // Non-fatal: hub_state already has credentials for sign-in.
    }
  }

  const { passwordHash: _, ...safe } = account;

  await notifyAdminsNewCustomer(state, account, "email");

  return { ok: true, account: safe };
}

export async function signInAccount(input: {
  email: string;
  password: string;
}): Promise<{ ok: true; account: Omit<HubAccount, "passwordHash"> } | { ok: false; error: string }> {
  const email = normalizeEmail(input.email);
  const existing = await findAccount(email);
  if (!existing) {
    return {
      ok: false,
      error: supabaseConfigured()
        ? "No account found for that email. Create an account first."
        : supabaseMissingConfigMessage(),
    };
  }
  if (!existing.passwordHash) {
    // Repair: password may live in hub_state but never reached the accounts table.
    if (supabaseConfigured()) {
      try {
        const doc = await readHubDocument<Partial<HubState>>();
        const remote = doc?.data.accounts?.find((a) => a.email === email);
        if (remote?.passwordHash) {
          existing.passwordHash = remote.passwordHash;
          rememberAccount(existing);
          await mirrorAccount(existing, true);
        }
      } catch {
        // Fall through to the setup message below.
      }
    }
  }
  if (!existing.passwordHash) {
    return {
      ok: false,
      error:
        "This email is registered but has no password saved yet. Use Create account with the same email to finish setup.",
    };
  }
  if (!(await passwordMatches(input.password, existing.passwordHash))) {
    return { ok: false, error: "Incorrect password." };
  }
  const state = getMemory();
  const role = resolveRole(email, state.adminInvites, existing.role);
  if (existing.role !== role) {
    existing.role = role;
    if (role === "admin" && !isMainAdminEmail(email)) {
      state.adminInvites = state.adminInvites.filter((e) => e !== email);
    }
    await bumpAndWait(state);
  }
  try {
    await mirrorAccount(existing, true);
  } catch {
    // Hub document already has credentials.
  }
  const { passwordHash: _, ...safe } = existing;
  return { ok: true, account: safe };
}

export async function upsertOAuthAccount(input: {
  name: string;
  email: string;
  picture?: string;
}): Promise<Omit<HubAccount, "passwordHash"> & { isNew: boolean }> {
  if (!supabaseConfigured()) {
    throw new Error(supabaseMissingConfigMessage());
  }
  const state = await ensureStore();
  const email = normalizeEmail(input.email);
  let account = await findAccount(email);
  const role = resolveRole(email, state.adminInvites, account?.role);
  const googleName = normalizeAccountName(input.name) || email.split("@")[0];
  const isNew = !account;

  if (!account) {
    // Google-only account — no password. Email/password can be added later via Create account.
    account = {
      email,
      name: googleName,
      passwordHash: "",
      role,
      picture: input.picture,
      createdAt: new Date().toISOString(),
    };
  } else {
    // Keep password from email/password registration; keep a name the user may have edited.
    if (!account.name?.trim()) account.name = googleName;
    account.picture = input.picture ?? account.picture;
    account.role = role;
  }

  rememberAccount(account);
  if (role === "admin" && !isMainAdminEmail(email)) {
    state.adminInvites = state.adminInvites.filter((e) => e !== email);
  }
  await bumpAndWait(state);
  await mirrorAccount(account, true);
  const { passwordHash: _, ...safe } = account;

  if (isNew) {
    await notifyAdminsNewCustomer(state, account, "google");
  }

  return { ...safe, isNew };
}

export async function updateAccountProfile(input: {
  email: string;
  name: string;
}): Promise<Omit<HubAccount, "passwordHash">> {
  if (!supabaseConfigured()) {
    throw new Error(supabaseMissingConfigMessage());
  }
  const state = await ensureStore();
  const email = normalizeEmail(input.email);
  const account = await findAccount(email);
  if (!account) throw new Error("Account not found. Sign in again.");
  const name = normalizeAccountName(input.name);
  if (name.length < 2) throw new Error("Enter your full name (at least 2 characters).");
  account.name = name;
  account.role = resolveRole(email, state.adminInvites, account.role);
  rememberAccount(account);
  await bumpAndWait(state);
  await mirrorAccount(account, true);
  const { passwordHash: _, ...safe } = account;
  return safe;
}

export async function inviteAdmin(actorEmail: string, inviteEmail: string) {
  const state = await ensureStore();
  if (!isMainAdminEmail(actorEmail)) {
    return { ok: false as const, error: "Only the main admin can invite other admins." };
  }
  const email = normalizeEmail(inviteEmail);
  if (!email.includes("@")) return { ok: false as const, error: "Enter a valid email." };
  if (isMainAdminEmail(email)) return { ok: false as const, error: "That email is already the main admin." };

  const existing = state.accounts.find((a) => a.email === email);
  if (existing) {
    existing.role = "admin";
    state.adminInvites = state.adminInvites.filter((e) => e !== email);
  } else if (!state.adminInvites.includes(email)) {
    state.adminInvites.push(email);
  }

  await bumpAndWait(state);
  return { ok: true as const, invites: pendingAdminInvites(state) };
}

export async function removeAdminInvite(actorEmail: string, inviteEmail: string) {
  if (!isMainAdminEmail(actorEmail)) {
    return { ok: false as const, error: "Only the main admin can manage admins." };
  }
  const email = normalizeEmail(inviteEmail);
  if (!email) {
    return { ok: false as const, error: "Invalid email." };
  }
  if (isMainAdminEmail(email)) {
    return { ok: false as const, error: "The main admin cannot be removed." };
  }

  const state = await ensureStore();
  const existing = state.accounts.find((a) => a.email === email);
  const wasActiveAdmin = existing?.role === "admin";

  state.adminInvites = state.adminInvites.filter((e) => e !== email);

  if (existing) {
    state.accounts = state.accounts.filter((a) => a.email !== email);
    if (state.favorites) delete state.favorites[email];
    state.notifications = (state.notifications ?? []).filter((n) => n.email !== email);
  }

  await bumpAndWait(state);

  if (existing && supabaseConfigured()) {
    try {
      await deleteAccountRow(email);
    } catch (error) {
      console.error("[admins] failed to delete account row:", error);
      return { ok: false as const, error: "Could not remove this admin." };
    }
  }

  return {
    ok: true as const,
    invites: pendingAdminInvites(state),
    removedAccount: Boolean(existing),
    wasActiveAdmin,
  };
}

function pendingAdminInvites(state: HubState) {
  const active = new Set(
    state.accounts
      .filter((a) => a.role === "admin" && !isMainAdminEmail(a.email))
      .map((a) => a.email),
  );
  return state.adminInvites.filter((e) => !active.has(e));
}

export async function listCustomers(actorEmail: string) {
  const state = await ensureStore();
  if (roleForState(state, actorEmail) !== "admin") {
    return { ok: false as const, error: "Admins only." };
  }

  const byEmail = new Map<string, { name: string; email: string; picture?: string }>();

  for (const account of state.accounts) {
    if (isMainAdminEmail(account.email)) continue;
    if (account.role === "admin") continue;
    byEmail.set(account.email, {
      name: account.name.trim() || account.email.split("@")[0],
      email: account.email,
      picture: account.picture,
    });
  }

  if (supabaseConfigured()) {
    try {
      const rows = await listAccountRows();
      for (const row of rows) {
        const email = normalizeEmail(String(row.email ?? ""));
        if (!email || isMainAdminEmail(email)) continue;
        if (row.role === "admin") continue;
        const name = String(row.name ?? "").trim() || email.split("@")[0];
        const picture = typeof row.picture === "string" ? row.picture : undefined;
        const existing = byEmail.get(email);
        byEmail.set(email, {
          name: existing?.name && existing.name !== email.split("@")[0] ? existing.name : name,
          email,
          picture: existing?.picture || picture,
        });
      }
    } catch {
      // hub accounts still populate the directory
    }
  }

  const customers = [...byEmail.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  return { ok: true as const, customers };
}

/** Main admin only — delete a registered traveller so they can no longer sign in. */
export async function removeCustomer(actorEmail: string, customerEmail: string) {
  if (!isMainAdminEmail(actorEmail)) {
    return { ok: false as const, error: "Only the main admin can remove customers." };
  }
  const email = normalizeEmail(customerEmail);
  if (!email) {
    return { ok: false as const, error: "Invalid email." };
  }
  if (isMainAdminEmail(email)) {
    return { ok: false as const, error: "The main admin cannot be removed." };
  }

  const state = await ensureStore();
  const account = state.accounts.find((a) => a.email === email);
  if (account?.role === "admin" || roleForState(state, email) === "admin") {
    return { ok: false as const, error: "Admin accounts cannot be removed from Customers." };
  }

  state.accounts = state.accounts.filter((a) => a.email !== email);
  if (state.favorites) delete state.favorites[email];
  state.notifications = (state.notifications ?? []).filter((n) => n.email !== email);
  await bumpAndWait(state);

  if (supabaseConfigured()) {
    try {
      await deleteFavoriteRowsForEmail(email);
      await deleteAccountRow(email);
    } catch (error) {
      console.error("[customers] failed to delete account row:", error);
      return { ok: false as const, error: "Could not remove this customer." };
    }
  }

  return { ok: true as const };
}

export async function listAdminInvites(actorEmail: string) {
  const state = await ensureStore();
  if (roleForState(state, actorEmail) !== "admin") {
    return { ok: false as const, error: "Admins only." };
  }
  return {
    ok: true as const,
    invites: pendingAdminInvites(state),
    mainAdmin: isMainAdminEmail(actorEmail),
    admins: state.accounts
      .filter((a) => a.role === "admin" && !isMainAdminEmail(a.email))
      .map(({ passwordHash: _, ...a }) => a),
  };
}

export async function assertAdmin(email: string) {
  const state = await ensureStore();
  if (roleForState(state, email) !== "admin") {
    throw new Error("Admin access required.");
  }
  return state;
}

export async function createBookingRecord(input: {
  listingId: string;
  guests: number;
  date: string;
  endDate?: string;
  packageId?: string;
  total?: number;
  customer: string;
  customerEmail?: string;
  customerPhone?: string;
  notifyPreference?: NotifyPreference;
  guestCheckout?: boolean;
}): Promise<Booking> {
  const { syncEnvFromGlobal } = await import("@/lib/worker-env");
  syncEnvFromGlobal();

  const state = await ensureStore();
  const listing = state.listings.find((l) => l.id === input.listingId);
  if (!listing) throw new Error("Listing not found");
  if (!isListingAvailable(listing)) {
    throw new Error(
      listing.unavailableReason?.trim() || "This listing is currently unavailable.",
    );
  }
  state.packages = ensurePackageCatalog(state.packages);
  hydrateListingFromCatalog(listing, state.packages);
  if (resolvePricingType(listing) === "per_package" && !input.packageId) {
    throw new Error("Please select a package.");
  }
  if (input.packageId) {
    const selected = listing.packages?.find((p) => p.id === input.packageId);
    if (!selected || selected.active === false) {
      throw new Error("That package is no longer available. Please choose another.");
    }
  }

  const existing = await mergeAllBookings();
  // Re-anchor to live memory AFTER merging: refreshStoreBookings()/applyRemote()
  // refreshes global state mid-flight, and mutating a stale reference would
  // silently drop this reservation when persistToRemote() re-reads getMemory().
  const liveState = getMemory();
  const quote = quoteBooking(listing, {
    guests: input.guests,
    startDate: input.date,
    endDate: input.endDate,
    packageId: input.packageId,
  });
  assertBookingFitsCapacity(listing, existing, quote);

  // References are unique in Supabase — never hand out (or mirror) a duplicate.
  const takenRefs = new Set(existing.map((b) => b.reference.toLowerCase()));
  let ref = "";
  do {
    // trim(): a destination like "El Nido " must not yield "EXH-1234-EL "
    // (trailing space) — it breaks exact reference lookups in Supabase.
    ref = `EXH-${Math.floor(1000 + Math.random() * 8999)}-${listing.destination
      .trim()
      .slice(0, 3)
      .toUpperCase()}`;
  } while (takenRefs.has(ref.toLowerCase()));
  const booking: Booking = {
    id: crypto.randomUUID(),
    reference: ref,
    listingId: listing.id,
    listingTitle: listing.title,
    kind: listing.kind,
    image: listing.images[0] ?? "",
    guests: quote.guests,
    date: quote.startDate,
    startDate: quote.startDate,
    startTime: quote.startTime || undefined,
    endDate: quote.endDate,
    endTime: quote.endTime || undefined,
    durationDays: quote.durationDays,
    durationNights: quote.durationNights,
    pricingType: quote.pricingType,
    packageId: quote.packageId,
    packageNameSnapshot: quote.packageName,
    packagePriceSnapshot: quote.packagePrice,
    packageSnapshot: quote.packageSnapshot,
    subtotal: quote.subtotal,
    total: quote.total,
    status: "pending",
    paid: false,
    customer: input.customer,
    customerEmail: input.customerEmail ? normalizeEmail(input.customerEmail) : undefined,
    customerPhone: input.customerPhone,
    notifyPreference: input.notifyPreference ?? "call",
    guestCheckout: input.guestCheckout === true,
    createdAt: new Date().toISOString(),
    statusUpdatedAt: new Date().toISOString(),
  };
  liveState.bookings.unshift(booking);
  const submittedBody = bookingPushBody(
    booking,
    `${listing.title} (${ref})${quote.packageName ? ` · ${quote.packageName}` : ""} is pending approval.`,
  );
  if (input.customerEmail) {
    pushNotification(liveState, {
      email: input.customerEmail,
      title: "Booking submitted",
      body: submittedBody,
      link: "/dashboard",
      kind: "booking",
    });
  }
  await bumpAndWait(liveState);
  await mirrorBooking(booking);

  const { absoluteUrl, sendPushToAdmins, sendPushToEmails, deliverPushSafely } = await import(
    "@/lib/onesignal.server"
  );
  const adminResult = await deliverPushSafely("booking-new-admin", () =>
    sendPushToAdmins(adminEmails(liveState), {
      title: "New booking",
      body: [
        `${booking.customer} · ${listing.title}`,
        quote.packageName
          ? `Package: ${quote.packageName}${
              quote.packagePrice != null ? ` · ${peso(quote.packagePrice)}` : ""
            }${
              quote.packageSnapshot
                ? ` ${PACKAGE_BILLING_LABELS[resolvePackageBilling(quote.packageSnapshot)].toLowerCase()}`
                : ""
            }`
          : null,
        bookingDateRangeLabel(booking),
        bookingDurationLabel(booking),
        `${booking.guests} guests · ${peso(booking.total)} · ${booking.status}`,
      ]
        .filter(Boolean)
        .join("\n"),
      url: absoluteUrl("/admin"),
      idempotencyKey: `booking-new-${booking.id}`,
    }),
  );
  if (adminResult && adminResult.recipients > 0) {
    markPushBookingNewSent(liveState, booking.id);
    await bumpAndWait(liveState);
  } else {
    console.warn("[booking] admin push delivered to 0 devices — keepalive will retry", adminResult);
  }
  if (input.customerEmail) {
    await deliverPushSafely("booking-submitted-tourist", () =>
      sendPushToEmails([input.customerEmail!], {
        title: "Booking submitted",
        body: submittedBody,
        url: absoluteUrl("/dashboard"),
        idempotencyKey: `booking-submitted-${booking.id}`,
      }),
    );
  }

  const { notifyAdminsNewBookingTelegram, deliverTelegramSafely } = await import(
    "@/lib/telegram.server"
  );
  await deliverTelegramSafely("booking-new-admin", () =>
    notifyAdminsNewBookingTelegram(telegramAlertFromBooking(booking, absoluteUrl("/admin"))),
  );

  return booking;
}

/** Write listing availability (and core fields) into a real Supabase table. */
async function mirrorListing(listing: Listing) {
  if (!supabaseConfigured()) return;
  try {
    await upsertListingRow({
      id: listing.id,
      slug: listing.slug,
      kind: listing.kind,
      title: listing.title,
      destination: listing.destination,
      status: listing.status,
      available: listing.available !== false,
      unavailable_reason: listing.available === false ? listing.unavailableReason ?? null : null,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[listings] supabase mirror failed", error);
  }
}

/** Write the booking into the real Supabase table so admins see it in the dashboard/DB. */
async function mirrorBooking(booking: Booking, required = false) {
  if (!supabaseConfigured()) {
    if (required) throw new Error("Booking database is not configured.");
    return;
  }

  const minimalRow = {
    id: booking.id,
    reference: booking.reference,
    listing_id: booking.listingId,
    listing_title: booking.listingTitle,
    kind: booking.kind,
    guests: booking.guests,
    date: booking.date,
    total: booking.total,
    status: booking.status,
    paid: booking.paid,
    customer: booking.customer,
    customer_email: booking.customerEmail ?? null,
    created_at: booking.createdAt ?? new Date().toISOString(),
  };

  const scheduleRow = {
    start_date: booking.startDate ?? booking.date,
    start_time: booking.startTime ?? null,
    end_date: booking.endDate ?? booking.date,
    end_time: booking.endTime ?? null,
    duration_days: booking.durationDays ?? null,
    duration_nights: booking.durationNights ?? null,
    pricing_type: booking.pricingType ?? null,
    package_id: booking.packageId ?? null,
    package_name: booking.packageNameSnapshot ?? null,
    package_price: booking.packagePriceSnapshot ?? null,
    package_snapshot: booking.packageSnapshot ?? null,
    subtotal: booking.subtotal ?? booking.total,
  };

  const fullRow = {
    ...minimalRow,
    ...scheduleRow,
    customer_phone: booking.customerPhone ?? null,
    notify_preference: booking.notifyPreference ?? "call",
    guest_checkout: booking.guestCheckout === true,
    status_updated_at: booking.statusUpdatedAt ?? null,
    approved_at: booking.approvedAt ?? null,
    rejected_at: booking.rejectedAt ?? null,
    status_by: booking.statusBy ?? null,
    admin_note: booking.adminNote ?? null,
    payment_method: booking.paymentMethod ?? null,
    paid_at: booking.paidAt ?? null,
  };

  try {
    await upsertBookingRow(fullRow);
    return;
  } catch (err) {
    console.error("[booking] full mirror failed:", booking.reference, err);
    try {
      // Retry without extended columns for projects that have not run every migration.
      const reducedRow = { ...fullRow };
      for (const key of Object.keys(scheduleRow)) delete (reducedRow as Record<string, unknown>)[key];
      await upsertBookingRow(reducedRow);
      return;
    } catch {
      try {
        const withoutGuestFlag = { ...fullRow };
        for (const key of Object.keys(scheduleRow)) delete (withoutGuestFlag as Record<string, unknown>)[key];
        delete (withoutGuestFlag as Record<string, unknown>).guest_checkout;
        await upsertBookingRow(withoutGuestFlag);
        return;
      } catch {
        try {
          await upsertBookingRow(minimalRow);
          return;
        } catch (minimalErr) {
          console.error("[booking] minimal mirror failed:", booking.reference, minimalErr);
          if (required) {
            throw minimalErr instanceof Error
              ? minimalErr
              : new Error("Could not save booking to database.");
          }
        }
      }
    }
  }
}


export async function setBookingStatus(
  id: string,
  status: BookingStatus,
  options: { note?: string; actorEmail?: string } = {},
) {
  const state = await ensureStore();
  let booking = state.bookings.find((b) => b.id === id);
  if (!booking) {
    const merged = await mergeAllBookings();
    const found = merged.find((b) => b.id === id);
    if (found) {
      state.bookings.unshift(found);
      booking = found;
    }
  }
  if (!booking) throw new Error("Booking not found");
  const now = new Date().toISOString();
  booking.status = status;
  booking.statusUpdatedAt = now;
  if (options.actorEmail) booking.statusBy = normalizeEmail(options.actorEmail);
  if (options.note !== undefined) booking.adminNote = options.note.trim() || undefined;
  if (status === "partial_payment" || status === "completed_payment") {
    booking.approvedAt = booking.approvedAt ?? now;
    booking.paid = true;
    booking.paidAt = now;
  }
  if (status === "completed") {
    booking.approvedAt = booking.approvedAt ?? now;
    booking.paid = true;
    booking.paidAt = booking.paidAt ?? now;
  }
  if (status === "approved" || status === "confirmed") {
    // Approved means the reservation is confirmed but still awaiting payment.
    booking.approvedAt = now;
    booking.paid = false;
  }
  if (status === "rejected" || status === "cancelled") {
    booking.rejectedAt = now;
    booking.paid = false;
  }

  const email = booking.customerEmail?.trim().toLowerCase();
  const labels: Record<BookingStatus, string> = {
    pending: "Booking received",
    approved: "Booking approved",
    confirmed: "Booking confirmed",
    completed: "Trip completed",
    partial_payment: "Partial payment received",
    completed_payment: "Payment completed",
    cancelled: "Booking cancelled",
    rejected: "Booking declined",
  };
  const packageLead = booking.packageNameSnapshot
    ? `Your ${booking.packageNameSnapshot} package for ${booking.listingTitle}`
    : booking.listingTitle;
  const bodies: Record<BookingStatus, string> = {
    pending: bookingPushBody(booking, `${packageLead} (${booking.reference}) is awaiting review.`),
    approved: bookingPushBody(
      booking,
      `${packageLead} has been approved. Settle your payment to finalize this reservation.`,
    ),
    confirmed: bookingPushBody(booking, `${packageLead} has been confirmed.`),
    completed: `We hope you enjoyed ${booking.listingTitle}. Leave a review when you have a moment.`,
    partial_payment: bookingPushBody(
      booking,
      `We received a partial payment for ${packageLead} (${booking.reference}). Please settle the remaining balance.`,
    ),
    completed_payment: bookingPushBody(
      booking,
      `Your payment for ${packageLead} (${booking.reference}) is complete. See you soon!`,
    ),
    cancelled: `${booking.listingTitle} (${booking.reference}) was cancelled.`,
    rejected: `${booking.listingTitle} (${booking.reference}) could not be confirmed.${
      options.note ? ` ${options.note}` : ""
    }`,
  };
  if (email) {
    pushNotification(state, {
      email,
      title: labels[status],
      body: bodies[status],
      link: "/dashboard",
      kind: "booking",
    });
  }

  bump(state);
  await mirrorBooking(booking);

  const { absoluteUrl, sendPushToAdmins, sendPushToEmails, deliverPushSafely } = await import(
    "@/lib/onesignal.server"
  );

  // Tourist (registered + subscribed on PWA or desktop): approve / reject / cancel / confirm.
  // Guest bookings with an email still attempt External ID push if they ever subscribed.
  if (email) {
    await deliverPushSafely(`booking-${status}-tourist`, () =>
      sendPushToEmails([email], {
        title: labels[status],
        body: bodies[status],
        url: absoluteUrl("/dashboard"),
        idempotencyKey: `booking-${status}-${booking.id}-${booking.statusUpdatedAt}`,
      }),
    );
  }

  // Admin always gets status pushes for the Bookings feed (volume-safe, never throws).
  if (
    status === "approved" ||
    status === "rejected" ||
    status === "cancelled" ||
    status === "confirmed" ||
    status === "partial_payment" ||
    status === "completed_payment"
  ) {
    await deliverPushSafely(`booking-${status}-admin`, () =>
      sendPushToAdmins(adminEmails(state), {
        title: labels[status],
        body: `${booking.listingTitle} (${booking.reference}) is now ${status}.\n${bookingDateRangeLabel(booking)}`,
        url: absoluteUrl("/admin"),
        idempotencyKey: `admin-booking-${status}-${booking.id}-${booking.statusUpdatedAt}`,
      }),
    );
  }

  if (status === "rejected") {
    const { notifyAdminsBookingRejectedTelegram, deliverTelegramSafely } = await import(
      "@/lib/telegram.server"
    );
    await deliverTelegramSafely("booking-rejected-admin", () =>
      notifyAdminsBookingRejectedTelegram(telegramAlertFromBooking(booking, absoluteUrl("/admin"))),
    );
  }

  if (status === "approved") {
    const { notifyAdminsBookingApprovedTelegram, deliverTelegramSafely } = await import(
      "@/lib/telegram.server"
    );
    await deliverTelegramSafely("booking-approved-admin", () =>
      notifyAdminsBookingApprovedTelegram(telegramAlertFromBooking(booking, absoluteUrl("/admin"))),
    );
  }

  if (status === "partial_payment" || status === "completed_payment") {
    const { deliverTelegramSafely } = await import("@/lib/telegram.server");
    await deliverTelegramSafely(`booking-${status}-admin`, async () => {
      const { sendTelegramMessage } = await import("@/lib/telegram.server");
      return sendTelegramMessage(
        [
          `💰 ${status === "partial_payment" ? "Partial payment" : "Full payment"} received`,
          `${booking.listingTitle} (${booking.reference})`,
          `${booking.customer} · ${peso(booking.total)}${
            booking.paymentMethod ? ` · via ${booking.paymentMethod}` : ""
          }`,
        ].join("\n"),
      );
    });
  }

  return {
    id,
    status,
    statusUpdatedAt: booking.statusUpdatedAt,
    approvedAt: booking.approvedAt,
    rejectedAt: booking.rejectedAt,
    adminNote: booking.adminNote,
    statusBy: booking.statusBy,
    paid: booking.paid,
    paidAt: booking.paidAt,
    paymentMethod: booking.paymentMethod,
  };
}

/** Tourist picked a payment gateway for an approved reservation (e.g. PayMaya). */
export async function setBookingPaymentMethod(id: string, method: string) {
  const state = await ensureStore();
  let booking = state.bookings.find((b) => b.id === id);
  if (!booking) {
    const merged = await mergeAllBookings();
    const found = merged.find((b) => b.id === id);
    if (found) {
      state.bookings.unshift(found);
      booking = found;
    }
  }
  if (!booking) throw new Error("Booking not found");
  booking.paymentMethod = method.trim().toLowerCase().slice(0, 40) || undefined;
  bump(state);
  await mirrorBooking(booking);
  return { id, paymentMethod: booking.paymentMethod };
}

/** Live feed — merges Supabase table rows with hub document reservations. */
export async function getBookingFeed(limit = 25) {
  const { syncEnvFromGlobal } = await import("@/lib/worker-env");
  syncEnvFromGlobal();

  const merged = await mergeAllBookings();
  void backfillBookingsTable(merged);

  const bookings = merged.slice(0, limit).map(mapBookingToFeed);
  return {
    source: "live" as const,
    bookings,
  };
}

/** Admin console + revenue — merges every reservation source for a complete queue. */
export async function getAdminBookings(): Promise<Booking[]> {
  const { syncEnvFromGlobal } = await import("@/lib/worker-env");
  syncEnvFromGlobal();

  const merged = await mergeAllBookings();
  void backfillBookingsTable(merged);
  return merged;
}

/** Main admin only — clears all bookings from hub state, live feed, and Supabase. */
export async function resetRevenueRecords(actorEmail: string, code: string) {
  if (!isMainAdminEmail(actorEmail)) {
    return { ok: false as const, error: "Only the main admin can reset revenue." };
  }
  if (code.trim() !== REVENUE_RESET_CODE) {
    return { ok: false as const, error: "Invalid reset code." };
  }

  const state = await ensureStore();
  const clearedAt = new Date().toISOString();
  state.bookings = [];
  state.bookingsClearedAt = clearedAt;
  await bumpAndWait(state);

  if (supabaseConfigured()) {
    try {
      await deleteAllBookingRows();
    } catch (error) {
      console.error("[revenue] failed to clear bookings table:", error);
      return { ok: false as const, error: "Could not clear booking records." };
    }
  }

  return { ok: true as const };
}

/** Traveller dashboard bookings — every reservation submitted with this email.
 * Unions the Supabase `bookings` table with hub-document reservations so guest
 * checkouts are never dropped, whatever source currently holds them. */
export async function getBookingsForEmail(email: string): Promise<Booking[]> {
  const state = await ensureStore();
  const key = normalizeEmail(email);
  const merged = new Map<string, Booking>();

  // mergeAllBookings() re-reads the hub document AND the bookings table, so a
  // guest checkout made before this account existed is picked up whichever
  // source currently holds it (and whichever worker isolate served it).
  for (const booking of await mergeAllBookings()) {
    if (normalizeEmail(booking.customerEmail ?? "") === key) merged.set(booking.id, booking);
  }

  if (supabaseConfigured()) {
    try {
      const rows = await listBookingRowsByEmail(key);
      for (const row of rows) {
        const booking = rowToBooking(row, state.listings);
        if (normalizeEmail(booking.customerEmail ?? "") !== key) continue;
        merged.set(booking.id, booking); // table row wins on id conflict
      }
    } catch {
      // Bookings table unavailable — hub-document rows above still serve the dashboard.
    }
  }

  return sortBookingsNewestFirst(
    bookingsAfterReset(Array.from(merged.values()), getMemory().bookingsClearedAt),
  );
}

async function refreshStoreBookings() {
  if (!supabaseConfigured()) return;
  try {
    const doc = await readHubDocument<Partial<HubState>>();
    if (doc) applyRemote({ ...doc.data, revision: doc.revision });
  } catch {
    // fall through to in-memory state
  }
}

/** Public lookup for QR confirmation pages and receipts. */
export async function getBookingByReference(reference: string): Promise<Booking | null> {
  const { syncEnvFromGlobal } = await import("@/lib/worker-env");
  syncEnvFromGlobal();

  await ensureStore();
  await refreshStoreBookings();
  const state = getMemory();
  const ref = decodeURIComponent(reference.trim());
  if (!ref) return null;
  const refKey = ref.toLowerCase();

  if (supabaseConfigured()) {
    try {
      const rows = await listBookingRowsByReference(ref);
      if (rows[0]) {
        const booking = rowToBooking(rows[0], state.listings);
        if (bookingsAfterReset([booking], state.bookingsClearedAt).length) return booking;
      }
    } catch (error) {
      console.error("[booking] table lookup failed:", error);
    }

    try {
      const hubRow = await findBookingInHubDocument(ref);
      if (hubRow) {
        const booking = rowToBooking(hubRow, state.listings);
        if (bookingsAfterReset([booking], state.bookingsClearedAt).length) return booking;
      }
    } catch (error) {
      console.error("[booking] hub document lookup failed:", error);
    }
  }

  return (
    bookingsAfterReset(sanitizeDemoBookings(state.bookings), state.bookingsClearedAt).find(
      (b) => b.reference.toLowerCase() === refKey,
    ) ?? null
  );
}

/** Persist an account permanently in the Supabase `accounts` table. */
async function mirrorAccount(account: HubAccount, required = false) {
  if (!supabaseConfigured()) {
    if (required) throw new Error("Account services are not available.");
    return;
  }
  try {
    const row: Record<string, unknown> = {
      email: account.email,
      name: account.name,
      role: account.role,
      picture: account.picture ?? null,
      notify_preference: account.notifyPreference ?? "call",
      contact_number: account.contactNumber ?? null,
      created_at: account.createdAt,
      updated_at: new Date().toISOString(),
    };
    // Only send password_hash when present — Google-only accounts have none, and
    // some Supabase projects have not added that column yet.
    if (account.passwordHash) {
      row.password_hash = account.passwordHash;
    }
    await upsertAccountRow(row);
  } catch (error) {
    if (required) throw error;
    // Non-fatal for profile updates when the hub document already has the account.
  }
}

export async function updateNotifyPreferences(input: {
  email: string;
  notifyPreference: NotifyPreference;
  contactNumber?: string;
}) {
  const state = await ensureStore();
  const email = normalizeEmail(input.email);
  const account = state.accounts.find((a) => a.email === email);
  if (!account) throw new Error("Account not found. Sign in again.");
  account.notifyPreference = input.notifyPreference;
  account.contactNumber = input.contactNumber?.trim() || undefined;
  bump(state);
  await mirrorAccount(account);
  return {
    notifyPreference: account.notifyPreference,
    contactNumber: account.contactNumber,
  };
}

export async function createListingRecord(actorEmail: string, input: ListingInput) {
  const state = await assertAdmin(actorEmail);
  const destinationName = input.destination.trim();
  const destination = ensureDestinationForName(
    state.destinations,
    destinationName,
    input.country,
    input.coords,
  );
  const baseSlug = slugify(input.title) || `listing-${Date.now()}`;
  let slug = baseSlug;
  let n = 1;
  while (state.listings.some((l) => l.slug === slug)) {
    slug = `${baseSlug}-${n++}`;
  }
  const listing: Listing = {
    id: crypto.randomUUID(),
    slug,
    kind: input.kind,
    title: input.title.trim(),
    tagline: input.tagline.trim(),
    description: input.description.trim(),
    destination: destinationName,
    country: input.country.trim() || destination?.country || "Palawan",
    category: input.category.trim(),
    price: Number(input.price) || 0,
    currency: "PHP",
    unit: input.unit.trim() || "per person",
    rating: 5,
    reviewCount: 0,
    images: input.images.length
      ? input.images
      : [
          "data:image/svg+xml," +
            encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect fill="#0b2b2b" width="100%" height="100%"/><text x="50%" y="50%" fill="#c9a96e" font-size="28" text-anchor="middle" dy=".3em">Nexora</text></svg>',
            ),
        ],
    amenities: input.amenities,
    tags: input.tags,
    durationDays: input.durationDays,
    durationNights: input.durationNights,
    startTime: input.startTime,
    endTime: input.endTime,
    autoEndDate: input.autoEndDate !== false,
    pricingType: input.pricingType ?? resolvePricingType({ kind: input.kind, unit: input.unit }),
    packageIds: input.packageIds,
    packages: input.packages,
    seatsLeft: input.seatsLeft,
    discountPct: input.discountPct && input.discountPct > 0 ? input.discountPct : undefined,
    featured: !!input.featured,
    status: input.status ?? "approved",
    businessName: input.businessName.trim() || input.title.trim(),
    createdAt: new Date().toISOString().slice(0, 10),
    coords: sanitizeCoords(input.coords) ?? coordsForDestination(destinationName, state.destinations),
    showMap: input.mapHidden !== true && input.showMap !== false,
    mapHidden: input.mapHidden === true || input.showMap === false,
    inclusions: input.inclusions,
    exclusions: input.exclusions,
    itinerary: input.itinerary,
    rooms: input.rooms,
    menu: input.menu,
    cancellationPolicy: input.cancellationPolicy ?? "Free cancellation up to 48 hours before.",
    faqs: [
      {
        q: "What is the cancellation window?",
        a: "Free cancellation up to 48 hours before the start date.",
      },
    ],
    reviews: [],
    available: input.available !== false,
    unavailableReason:
      input.available === false
        ? input.unavailableReason?.trim() || undefined
        : undefined,
  };
  state.packages = ensurePackageCatalog(state.packages);
  if (resolvePricingType(listing) === "per_package" || listing.kind === "package") {
    listing.pricingType = "per_package";
    listing.unit = listing.unit.includes("package") ? listing.unit : "per package";
    if (!listing.packageIds?.length) {
      listing.packageIds = state.packages.filter((p) => p.active !== false).map((p) => p.id);
    }
    hydrateListingFromCatalog(listing, state.packages);
    if (listing.kind === "package") {
      delete listing.durationDays;
      delete listing.durationNights;
    }
    const tierPrices = (listing.packages ?? [])
      .filter((p) => p.active !== false)
      .map((p) => p.price)
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (tierPrices.length) {
      listing.price = Math.min(...tierPrices);
    }
    if (!(listing.packages?.length)) {
      throw new Error("Assign at least one package tier before publishing a package listing.");
    }
  }
  state.listings.unshift(listing);
  recountDestinationListings(state.destinations, state.listings);
  await bumpAndWait(state);
  await mirrorListing(listing);

  if (listing.status === "approved") {
    const { absoluteUrl, sendPushToRole } = await import("@/lib/onesignal.server");
    const label = kindLabel(listing.kind);
    await sendPushToRole("tourist", {
      title: `New ${label} on Nexora`,
      body: `${listing.title} in ${listing.destination} is now available.`,
      url: absoluteUrl(`/listing/${listing.slug}`),
      idempotencyKey: `listing-new-${listing.id}`,
    });
  }
  return listing;
}

export async function updateListingRecord(
  actorEmail: string,
  id: string,
  patch: Partial<ListingInput>,
) {
  const state = await assertAdmin(actorEmail);
  const listing = state.listings.find((l) => l.id === id);
  if (!listing) throw new Error("Listing not found");
  const previousDestination = listing.destination;
  const previousPrice = listing.price;
  const previousDiscount = listing.discountPct ?? 0;
  const previousStatus = listing.status;
  if (patch.title !== undefined) listing.title = patch.title.trim();
  if (patch.tagline !== undefined) listing.tagline = patch.tagline.trim();
  if (patch.description !== undefined) listing.description = patch.description.trim();
  if (patch.destination !== undefined) listing.destination = patch.destination.trim();
  if (patch.country !== undefined) listing.country = patch.country.trim();
  if (listing.destination) {
    const dest = ensureDestinationForName(
      state.destinations,
      listing.destination,
      listing.country,
      patch.coords ?? listing.coords,
    );
    if (dest && !listing.country.trim()) listing.country = dest.country;
  }
  if (patch.category !== undefined) listing.category = patch.category.trim();
  if (patch.price !== undefined) listing.price = Number(patch.price) || 0;
  if (patch.unit !== undefined) listing.unit = patch.unit.trim();
  if (patch.images !== undefined) listing.images = patch.images;
  if (patch.amenities !== undefined) listing.amenities = patch.amenities;
  if (patch.tags !== undefined) listing.tags = patch.tags;
  if (patch.businessName !== undefined) listing.businessName = patch.businessName.trim();
  if (patch.featured !== undefined) listing.featured = patch.featured;
  if (patch.status !== undefined) listing.status = patch.status;
  if (patch.kind !== undefined) listing.kind = patch.kind;
  if (patch.durationDays !== undefined) listing.durationDays = patch.durationDays;
  if (patch.durationNights !== undefined) listing.durationNights = patch.durationNights;
  if (patch.startTime !== undefined) listing.startTime = patch.startTime;
  if (patch.endTime !== undefined) listing.endTime = patch.endTime;
  if (patch.autoEndDate !== undefined) listing.autoEndDate = patch.autoEndDate;
  if (patch.pricingType !== undefined) listing.pricingType = patch.pricingType;
  if (patch.packageIds !== undefined) listing.packageIds = patch.packageIds;
  if (patch.packages !== undefined) listing.packages = patch.packages;
  if (patch.seatsLeft !== undefined) listing.seatsLeft = patch.seatsLeft;
  if ("discountPct" in patch) {
    if (patch.discountPct == null || patch.discountPct <= 0) {
      delete listing.discountPct;
    } else {
      listing.discountPct = patch.discountPct;
    }
  }
  if (patch.inclusions !== undefined) listing.inclusions = patch.inclusions;
  if (patch.exclusions !== undefined) listing.exclusions = patch.exclusions;
  if (patch.itinerary !== undefined) listing.itinerary = patch.itinerary;
  if (patch.rooms !== undefined) listing.rooms = patch.rooms;
  if (patch.menu !== undefined) listing.menu = patch.menu;
  if (patch.cancellationPolicy !== undefined) listing.cancellationPolicy = patch.cancellationPolicy;
  if (patch.showMap !== undefined || patch.mapHidden !== undefined) {
    const hidden = patch.mapHidden === true || patch.showMap === false;
    listing.showMap = !hidden;
    listing.mapHidden = hidden;
  }
  if (patch.available !== undefined) {
    listing.available = patch.available;
    if (patch.available) {
      delete listing.unavailableReason;
    }
  }
  if ("unavailableReason" in patch) {
    const reason =
      typeof patch.unavailableReason === "string" ? patch.unavailableReason.trim() : "";
    if (listing.available === false && reason) listing.unavailableReason = reason;
    else if (listing.available !== false || !reason) delete listing.unavailableReason;
  }
  if ("coords" in patch) {
    const next = sanitizeCoords(patch.coords);
    if (next) listing.coords = next;
    else if (patch.coords === null) delete listing.coords;
  }
  const destinationChanged = listing.destination !== previousDestination;
  if (destinationChanged) {
    const incoming = sanitizeCoords(patch.coords);
    const stillOnOldTown =
      !incoming || sameCoords(incoming, coordsForDestination(previousDestination, state.destinations));
    if (stillOnOldTown) {
      listing.coords = coordsForDestination(listing.destination, state.destinations);
    }
  } else if (!sanitizeCoords(listing.coords)) {
    listing.coords = coordsForDestination(listing.destination, state.destinations);
  }
  state.packages = ensurePackageCatalog(state.packages);
  if (resolvePricingType(listing) === "per_package" || listing.kind === "package") {
    listing.pricingType = "per_package";
    if (!listing.unit.toLowerCase().includes("package")) listing.unit = "per package";
    if (!listing.packageIds?.length && !listing.packages?.length) {
      listing.packageIds = state.packages.filter((p) => p.active !== false).map((p) => p.id);
    }
    hydrateListingFromCatalog(listing, state.packages);
    if (listing.kind === "package") {
      delete listing.durationDays;
      delete listing.durationNights;
      const tierPrices = (listing.packages ?? [])
        .filter((p) => p.active !== false)
        .map((p) => p.price)
        .filter((n) => Number.isFinite(n) && n >= 0);
      if (tierPrices.length) listing.price = Math.min(...tierPrices);
      if (!(listing.packages?.length)) {
        throw new Error("Assign at least one package tier before publishing a package listing.");
      }
    }
  }
  recountDestinationListings(state.destinations, state.listings);
  await bumpAndWait(state);
  await mirrorListing(listing);

  const priceChanged = listing.price !== previousPrice;
  const discountChanged = (listing.discountPct ?? 0) !== previousDiscount;
  const newlyApproved = previousStatus !== "approved" && listing.status === "approved";
  if (newlyApproved || ((priceChanged || discountChanged) && listing.status === "approved")) {
    const { absoluteUrl, sendPushToRole } = await import("@/lib/onesignal.server");
    const label = kindLabel(listing.kind);
    if (newlyApproved) {
      await sendPushToRole("tourist", {
        title: `New ${label} on Nexora`,
        body: `${listing.title} in ${listing.destination} is now available.`,
        url: absoluteUrl(`/listing/${listing.slug}`),
        idempotencyKey: `listing-new-${listing.id}`,
      });
    } else if (priceChanged || discountChanged) {
      await sendPushToRole("tourist", {
        title: `Price update · ${label}`,
        body: `${listing.title} is now ₱${listing.price.toLocaleString("en-PH")}${
          listing.discountPct ? ` (${listing.discountPct}% off)` : ""
        }.`,
        url: absoluteUrl(`/listing/${listing.slug}`),
        idempotencyKey: `listing-price-${listing.id}-${listing.price}-${listing.discountPct ?? 0}`,
      });
    }
  }
  return listing;
}

export async function deleteListingRecord(actorEmail: string, id: string) {
  const state = await assertAdmin(actorEmail);
  const before = state.listings.length;
  state.listings = state.listings.filter((l) => l.id !== id);
  if (state.listings.length === before) throw new Error("Listing not found");
  recountDestinationListings(state.destinations, state.listings);
  await bumpAndWait(state);
  if (supabaseConfigured()) {
    try {
      await deleteListingRow(id);
    } catch (error) {
      console.error("[listings] supabase delete failed", error);
    }
  }
  return { id };
}

export async function createDestinationRecord(actorEmail: string, input: DestinationInput) {
  const state = await assertAdmin(actorEmail);
  const name = input.name.trim();
  if (name.length < 2) throw new Error("Destination name is required.");
  if (state.destinations.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
    throw new Error("A destination with that name already exists.");
  }
  const destination: Destination = {
    id: crypto.randomUUID(),
    name,
    country: input.country.trim() || "Palawan",
    tagline: (input.tagline ?? "").trim(),
    image: input.image?.trim() || FALLBACK_DESTINATION_IMAGE,
    listings: 0,
    coords: sanitizeCoords(input.coords) ?? coordsForDestination(name, state.destinations),
  };
  state.destinations.push(destination);
  recountDestinationListings(state.destinations, state.listings);
  await bumpAndWait(state);
  return destination;
}

export async function updateDestinationRecord(
  actorEmail: string,
  id: string,
  patch: Partial<DestinationInput>,
) {
  const state = await assertAdmin(actorEmail);
  const destination = state.destinations.find((d) => d.id === id);
  if (!destination) throw new Error("Destination not found");
  const previousName = destination.name;
  const previousCoords = sanitizeCoords(destination.coords);
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name.length < 2) throw new Error("Destination name is required.");
    const clash = state.destinations.some(
      (d) => d.id !== id && d.name.toLowerCase() === name.toLowerCase(),
    );
    if (clash) throw new Error("A destination with that name already exists.");
    destination.name = name;
    if (name !== previousName) {
      const previousKey = previousName.trim().toLowerCase();
      for (const listing of state.listings) {
        if (listing.destination.trim().toLowerCase() === previousKey) listing.destination = name;
      }
    }
  }
  if (patch.country !== undefined) destination.country = patch.country.trim() || destination.country;
  if (patch.tagline !== undefined) destination.tagline = patch.tagline.trim();
  if (patch.image !== undefined && patch.image.trim()) destination.image = patch.image.trim();
  if ("coords" in patch) {
    const next = sanitizeCoords(patch.coords);
    if (next) destination.coords = next;
  }
  const destKey = destination.name.trim().toLowerCase();
  for (const listing of state.listings) {
    if (listing.destination.trim().toLowerCase() !== destKey) continue;
    listing.country = destination.country;
    const pin = sanitizeCoords(listing.coords);
    if (!pin || sameCoords(pin, previousCoords)) {
      listing.coords = destination.coords ?? coordsForDestination(destination.name, state.destinations);
    }
  }
  recountDestinationListings(state.destinations, state.listings);
  await bumpAndWait(state);
  return destination;
}

export async function deleteDestinationRecord(actorEmail: string, id: string) {
  const state = await assertAdmin(actorEmail);
  const destination = state.destinations.find((d) => d.id === id);
  if (!destination) throw new Error("Destination not found");
  const used = state.listings.some(
    (l) => l.destination.trim().toLowerCase() === destination.name.trim().toLowerCase(),
  );
  if (used) throw new Error("Reassign or delete listings in this destination first.");
  state.destinations = state.destinations.filter((d) => d.id !== id);
  await bumpAndWait(state);
  return { id };
}

export async function createPackageRecord(actorEmail: string, input: PackageInput) {
  const state = await assertAdmin(actorEmail);
  state.packages = ensurePackageCatalog(state.packages);
  const position =
    input.position ??
    (state.packages.reduce((max, pkg) => Math.max(max, pkg.position ?? 0), -1) + 1);
  const pkg = normalizePackageInput(input, position);
  if (state.packages.some((p) => p.name.trim().toLowerCase() === pkg.name.toLowerCase())) {
    throw new Error("A package with that name already exists.");
  }
  state.packages.push(pkg);
  state.packages = sortPackages(state.packages);
  hydrateAllListingPackages(state);
  await bumpAndWait(state);
  await mirrorPackage(pkg);
  return pkg;
}

export async function updatePackageRecord(
  actorEmail: string,
  id: string,
  patch: Partial<PackageInput>,
) {
  const state = await assertAdmin(actorEmail);
  state.packages = ensurePackageCatalog(state.packages);
  const existing = state.packages.find((p) => p.id === id);
  if (!existing) throw new Error("Package not found");
  const next = normalizePackageInput(
    {
      name: patch.name ?? existing.name,
      description: patch.description ?? existing.description,
      price: patch.price ?? existing.price,
      inclusions: patch.inclusions ?? existing.inclusions,
      exclusions: patch.exclusions ?? existing.exclusions,
      guestLimit: "guestLimit" in patch ? patch.guestLimit : existing.guestLimit,
      image: "image" in patch ? patch.image : existing.image,
      active: patch.active ?? existing.active,
      position: patch.position ?? existing.position,
      durationDays: "durationDays" in patch ? patch.durationDays : existing.durationDays,
      durationNights: "durationNights" in patch ? patch.durationNights : existing.durationNights,
      pricingType: "pricingType" in patch ? patch.pricingType : existing.pricingType,
    },
    existing.position,
    existing.id,
  );
  if (
    state.packages.some(
      (p) => p.id !== id && p.name.trim().toLowerCase() === next.name.toLowerCase(),
    )
  ) {
    throw new Error("A package with that name already exists.");
  }
  Object.assign(existing, next);
  // Persist clears: JSON drops `undefined`, so clients send `null` and we delete the field.
  if ("guestLimit" in patch && (patch.guestLimit == null || !next.guestLimit)) {
    delete existing.guestLimit;
  }
  if ("image" in patch && !patch.image) delete existing.image;
  state.packages = sortPackages(state.packages);
  hydrateAllListingPackages(state);
  await bumpAndWait(state);
  await mirrorPackage(existing);
  return existing;
}

export async function deletePackageRecord(actorEmail: string, id: string) {
  const state = await assertAdmin(actorEmail);
  state.packages = ensurePackageCatalog(state.packages);
  const existing = state.packages.find((p) => p.id === id);
  if (!existing) throw new Error("Package not found");
  state.packages = state.packages.filter((p) => p.id !== id);
  for (const listing of state.listings) {
    if (listing.packageIds?.length) {
      listing.packageIds = listing.packageIds.filter((pkgId) => pkgId !== id);
    }
    if (listing.packages?.length) {
      listing.packages = listing.packages.filter((pkg) => pkg.id !== id);
    }
  }
  hydrateAllListingPackages(state);
  await bumpAndWait(state);
  if (supabaseConfigured()) {
    try {
      await deleteTravelPackageRow(id);
    } catch (error) {
      console.error("[packages] supabase delete failed", error);
    }
  }
  return { id };
}

export async function reorderPackagesRecord(actorEmail: string, orderedIds: string[]) {
  const state = await assertAdmin(actorEmail);
  state.packages = ensurePackageCatalog(state.packages);
  const byId = new Map(state.packages.map((pkg) => [pkg.id, pkg]));
  orderedIds.forEach((id, index) => {
    const pkg = byId.get(id);
    if (pkg) pkg.position = index;
  });
  state.packages = sortPackages(state.packages);
  hydrateAllListingPackages(state);
  await bumpAndWait(state);
  await mirrorAllPackages(state.packages);
  return state.packages;
}

export async function addTestimonialRecord(input: {
  author: string;
  email: string;
  role?: string;
  body: string;
  rating: number;
}) {
  const state = await ensureStore();
  const email = normalizeEmail(input.email);
  const account = state.accounts.find((a) => a.email === email);
  if (!account) throw new Error("Sign in to leave feedback.");
  const testimonial: Testimonial = {
    id: crypto.randomUUID(),
    author: input.author.trim() || account.name,
    email,
    role: input.role?.trim() || "Traveller",
    body: input.body.trim(),
    rating: Math.min(5, Math.max(1, Math.round(input.rating))),
    createdAt: new Date().toISOString(),
  };
  state.testimonials.unshift(testimonial);
  bump(state);

  const { absoluteUrl, sendPushToEmails } = await import("@/lib/onesignal.server");
  await sendPushToEmails([email], {
    title: "Thank you for your feedback",
    body: "We appreciate you sharing your experience with Nexora.",
    url: absoluteUrl("/dashboard"),
    idempotencyKey: `feedback-thanks-${testimonial.id}`,
  });

  return testimonial;
}

export async function deleteTestimonialRecord(actorEmail: string, id: string) {
  const state = await assertAdmin(actorEmail);
  state.testimonials = state.testimonials.filter((t) => t.id !== id);
  bump(state);
  return { id };
}

export async function addListingReview(input: {
  email: string;
  name: string;
  listingId: string;
  rating: number;
  body: string;
}) {
  const state = await ensureStore();
  const email = normalizeEmail(input.email);
  const account = state.accounts.find((a) => a.email === email);
  if (!account) throw new Error("Sign in to leave a rating.");

  const listing = state.listings.find((l) => l.id === input.listingId);
  if (!listing) throw new Error("Listing not found.");

  if (!listing.reviews) listing.reviews = [];
  if (listing.reviews.some((r) => r.email === email)) {
    throw new Error("You already rated this listing.");
  }

  const review: Review = {
    id: crypto.randomUUID(),
    author: input.name.trim() || account.name,
    email,
    avatar: (input.name.trim() || account.name).slice(0, 2).toUpperCase(),
    rating: Math.min(5, Math.max(1, Math.round(input.rating))),
    date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    body: input.body.trim(),
  };
  listing.reviews.unshift(review);
  recalculateListingRating(listing);
  bump(state);

  const { absoluteUrl, sendPushToEmails } = await import("@/lib/onesignal.server");
  await sendPushToEmails([email], {
    title: "Thank you for your feedback",
    body: `Thanks for rating ${listing.title}. Your review helps other travellers.`,
    url: absoluteUrl(`/listing/${listing.slug}`),
    idempotencyKey: `feedback-thanks-${review.id}`,
  });

  return review;
}

export async function removeListingReview(actorEmail: string, listingId: string, reviewId: string) {
  const state = await assertAdmin(actorEmail);
  const listing = state.listings.find((l) => l.id === listingId);
  if (!listing) throw new Error("Listing not found.");
  listing.reviews = (listing.reviews ?? []).filter((r) => r.id !== reviewId);
  recalculateListingRating(listing);
  bump(state);
  return { id: reviewId };
}

export async function toggleFavorite(email: string, listingId: string) {
  const state = await ensureStore();
  const key = normalizeEmail(email);
  if (!key.includes("@")) throw new Error("Sign in to save favourites.");
  if (!state.accounts.some((a) => a.email === key) && !isMainAdminEmail(key)) {
    throw new Error("Sign in to save favourites.");
  }
  if (!state.listings.some((l) => l.id === listingId)) {
    throw new Error("Listing not found.");
  }

  if (!state.favorites) state.favorites = {};
  const list = state.favorites[key] ?? [];
  const idx = list.indexOf(listingId);
  let saved: boolean;
  if (idx >= 0) {
    list.splice(idx, 1);
    state.favorites[key] = list;
    saved = false;
  } else {
    state.favorites[key] = [listingId, ...list];
    saved = true;
  }
  await bumpAndWait(state);

  if (supabaseConfigured()) {
    try {
      if (saved) await upsertFavoriteRow(key, listingId);
      else await deleteFavoriteRow(key, listingId);
    } catch (error) {
      console.error("[favorites] supabase mirror failed", error);
    }
  }

  return { saved, listingIds: state.favorites[key] };
}

export async function listFavorites(email: string) {
  const state = await ensureStore();
  const key = normalizeEmail(email);
  if (!state.favorites) state.favorites = {};

  let ids = state.favorites[key] ?? [];

  // Hydrate from Supabase when hub is empty (e.g. after Worker cold start / hub reset).
  if (supabaseConfigured()) {
    try {
      const remote = await listFavoriteListingIds(key);
      if (remote.length) {
        const union = [...new Set([...ids, ...remote])];
        // Prefer remote order for missing hub entries; keep hub order first.
        const merged = [...ids];
        for (const id of remote) {
          if (!merged.includes(id)) merged.push(id);
        }
        if (merged.length !== ids.length || merged.some((id, i) => id !== ids[i])) {
          state.favorites[key] = merged;
          ids = merged;
          bump(state);
        }
      }
    } catch (error) {
      console.error("[favorites] supabase read failed", error);
    }
  }

  return ids
    .map((id) => state.listings.find((l) => l.id === id))
    .filter((l): l is NonNullable<typeof l> => Boolean(l));
}

export async function listNotifications(email: string) {
  const state = await ensureStore();
  const key = normalizeEmail(email);
  return (state.notifications ?? [])
    .filter((n) => n.email === key)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function markNotificationRead(email: string, id: string) {
  const state = await ensureStore();
  const key = normalizeEmail(email);
  const note = (state.notifications ?? []).find((n) => n.id === id && n.email === key);
  if (!note) throw new Error("Notification not found.");
  note.read = true;
  bump(state);
  return note;
}

export async function markAllNotificationsRead(email: string) {
  const state = await ensureStore();
  const key = normalizeEmail(email);
  for (const note of state.notifications ?? []) {
    if (note.email === key) note.read = true;
  }
  bump(state);
  return { ok: true as const };
}

export async function broadcastNotification(
  actorEmail: string,
  input: { title: string; body: string; link?: string; targetEmail?: string },
) {
  await assertAdmin(actorEmail);
  const state = await ensureStore();
  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 2 || body.length < 4) {
    throw new Error("Enter a title and message.");
  }

  const singleTarget = input.targetEmail?.trim()
    ? normalizeEmail(input.targetEmail)
    : "";
  const touristEmails = state.accounts
    .filter((a) => a.role === "tourist")
    .map((a) => a.email);

  const inboxTargets = singleTarget.includes("@") ? [singleTarget] : touristEmails;
  if (!inboxTargets.length) throw new Error("No travellers to notify yet.");

  for (const email of inboxTargets) {
    pushNotification(state, {
      email,
      title,
      body,
      link: input.link?.trim() || "/dashboard",
      kind: "message",
    });
  }
  bump(state);

  const { absoluteUrl, sendPushBroadcast, deliverPushSafely } = await import(
    "@/lib/onesignal.server"
  );
  const link = input.link?.trim() || "/dashboard";
  const broadcastId = crypto.randomUUID();

  const push = await deliverPushSafely("admin-broadcast", () =>
    sendPushBroadcast({
      title,
      body,
      url: absoluteUrl(link),
      targetEmail: singleTarget.includes("@") ? singleTarget : undefined,
      touristEmails,
      broadcastId,
    }),
  );

  return {
    sent: inboxTargets.length,
    pushRecipients: push?.recipients ?? 0,
    pushMode: push && "mode" in push ? push.mode : singleTarget ? "single" : "all-tourists",
  };
}
