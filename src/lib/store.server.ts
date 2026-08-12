/**
 * Compact app store for Cloudflare Worker / Node.
 * Durable state lives in the project's own Supabase instance (`hub_state` document),
 * with every booking mirrored into a real `bookings` table for admin visibility.
 * Revision bumps on every mutation so clients poll cheaply for realtime updates.
 */
import { destinations as seedDestinations, demoBookings, listings as seedListings } from "@/data/catalog";
import { isMainAdminEmail, normalizeEmail } from "@/lib/constants";
import {
  readHubDocument,
  readHubRevision,
  listBookingRows,
  supabaseConfigured,
  upsertAccountRow,
  upsertBookingRow,
  writeHubDocument,
} from "@/lib/supabase-rest.server";
import type {
  Booking,
  BookingStatus,
  NotifyPreference,
  Destination,
  HubAccount,
  HubSettings,
  Listing,
  ListingInput,
  Testimonial,
} from "@/lib/types";

export interface HubState {
  revision: number;
  listings: Listing[];
  bookings: Booking[];
  destinations: Destination[];
  accounts: HubAccount[];
  adminInvites: string[];
  testimonials: Testimonial[];
  settings: HubSettings;
}

const GLOBAL_KEY = "__nexora_store_v1__";

type GlobalStore = typeof globalThis & {
  [GLOBAL_KEY]?: HubState;
  __nexora_persist_timer?: ReturnType<typeof setTimeout>;
};

export const defaultSettings: HubSettings = {
  contactPhone: "+63 999 000 0000",
  contactMobile: "+63 999 000 0000",
  contactEmail: "sheethappenswithjaa@gmail.com",
  officeHours: "Daily · 7:00 AM – 9:00 PM (PHT)",
  bookingNotice:
    "Our team reviews every reservation manually. You will receive a call or text message once your booking is approved.",
};

function emptySeed(): HubState {
  return {
    revision: 1,
    listings: structuredClone(seedListings),
    bookings: structuredClone(demoBookings),
    destinations: structuredClone(seedDestinations),
    accounts: [],
    adminInvites: [],
    testimonials: [],
    settings: { ...defaultSettings },
  };
}

function getMemory(): HubState {
  const g = globalThis as GlobalStore;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = emptySeed();
  return g[GLOBAL_KEY]!;
}

let hydratePromise: Promise<void> | null = null;

function applyRemote(parsed: Partial<HubState> | null) {
  if (!parsed?.listings || !parsed?.bookings) return;
  const g = globalThis as GlobalStore;
  g[GLOBAL_KEY] = {
    revision: parsed.revision ?? 1,
    listings: parsed.listings,
    bookings: parsed.bookings,
    destinations: parsed.destinations?.length
      ? parsed.destinations
      : structuredClone(seedDestinations),
    accounts: parsed.accounts ?? [],
    adminInvites: (parsed.adminInvites ?? []).map(normalizeEmail),
    testimonials: parsed.testimonials ?? [],
    settings: { ...defaultSettings, ...(parsed.settings ?? {}) },
  };
}

async function hydrateFromRemote() {
  if (!supabaseConfigured()) return;
  try {
    const doc = await readHubDocument<Partial<HubState>>();
    if (doc) {
      applyRemote({ ...doc.data, revision: doc.revision });
    } else {
      // First boot against an empty database — publish the seed once.
      await writeHubDocument(getMemory(), getMemory().revision);
    }
  } catch {
    // Table missing or network hiccup — memory seed still serves the app.
  }
}

function schedulePersist() {
  const g = globalThis as GlobalStore;
  if (g.__nexora_persist_timer) clearTimeout(g.__nexora_persist_timer);
  g.__nexora_persist_timer = setTimeout(() => {
    void persistToRemote();
  }, 250);
}

async function persistToRemote() {
  if (!supabaseConfigured()) return;
  try {
    const state = getMemory();
    await writeHubDocument(state, state.revision);
  } catch {
    // Keep serving from memory; the next mutation retries the write.
  }
}

export async function ensureStore(): Promise<HubState> {
  if (!hydratePromise) hydratePromise = hydrateFromRemote();
  await hydratePromise;
  return getMemory();
}

function bump(state: HubState) {
  state.revision += 1;
  schedulePersist();
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
  return getMemory().revision === state.revision ? state : getMemory();
}

export async function getSettings(): Promise<HubSettings> {
  const state = await ensureStore();
  return { ...defaultSettings, ...state.settings };
}

export async function updateSettings(actorEmail: string, patch: Partial<HubSettings>) {
  const state = await assertAdmin(actorEmail);
  state.settings = { ...defaultSettings, ...state.settings, ...patch };
  bump(state);
  return state.settings;
}


export function resolveRole(email: string, invites: string[]): "tourist" | "admin" {
  const e = normalizeEmail(email);
  if (isMainAdminEmail(e)) return "admin";
  if (invites.includes(e)) return "admin";
  return "tourist";
}

export async function hashPassword(password: string) {
  const data = new TextEncoder().encode(`nexora:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
  const state = await ensureStore();
  const email = normalizeEmail(input.email);
  if (state.accounts.some((a) => a.email === email)) {
    return { ok: false, error: "An account with this email already exists. Sign in instead." };
  }
  const role = resolveRole(email, state.adminInvites);
  const account: HubAccount = {
    email,
    name: input.name.trim(),
    passwordHash: await hashPassword(input.password),
    role,
    createdAt: new Date().toISOString(),
  };
  state.accounts.push(account);
  if (role === "admin" && !isMainAdminEmail(email)) {
    state.adminInvites = state.adminInvites.filter((e) => e !== email);
  }
  bump(state);
  await mirrorAccount(account);
  const { passwordHash: _, ...safe } = account;
  return { ok: true, account: safe };
}

export async function signInAccount(input: {
  email: string;
  password: string;
}): Promise<{ ok: true; account: Omit<HubAccount, "passwordHash"> } | { ok: false; error: string }> {
  const state = await ensureStore();
  const email = normalizeEmail(input.email);
  const existing = state.accounts.find((a) => a.email === email);
  if (!existing) {
    return { ok: false, error: "No account found for that email. Create an account first." };
  }
  const hash = await hashPassword(input.password);
  if (hash !== existing.passwordHash) {
    return { ok: false, error: "Incorrect password." };
  }
  const role = resolveRole(email, state.adminInvites);
  if (existing.role !== role) {
    existing.role = role;
    if (role === "admin" && !isMainAdminEmail(email)) {
      state.adminInvites = state.adminInvites.filter((e) => e !== email);
    }
    bump(state);
  }
  await mirrorAccount(existing);
  const { passwordHash: _, ...safe } = existing;
  return { ok: true, account: safe };
}

export async function upsertOAuthAccount(input: {
  name: string;
  email: string;
  picture?: string;
}): Promise<Omit<HubAccount, "passwordHash">> {
  const state = await ensureStore();
  const email = normalizeEmail(input.email);
  const role = resolveRole(email, state.adminInvites);
  let account = state.accounts.find((a) => a.email === email);
  if (!account) {
    account = {
      email,
      name: input.name.trim() || email.split("@")[0],
      passwordHash: await hashPassword(crypto.randomUUID()),
      role,
      picture: input.picture,
      createdAt: new Date().toISOString(),
    };
    state.accounts.push(account);
  } else {
    account.name = input.name.trim() || account.name;
    account.picture = input.picture ?? account.picture;
    account.role = role;
  }
  if (role === "admin" && !isMainAdminEmail(email)) {
    state.adminInvites = state.adminInvites.filter((e) => e !== email);
  }
  bump(state);
  await mirrorAccount(account);
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
  if (!state.adminInvites.includes(email)) state.adminInvites.push(email);
  const existing = state.accounts.find((a) => a.email === email);
  if (existing) existing.role = "admin";
  bump(state);
  return { ok: true as const, invites: state.adminInvites };
}

export async function removeAdminInvite(actorEmail: string, inviteEmail: string) {
  const state = await ensureStore();
  if (!isMainAdminEmail(actorEmail)) {
    return { ok: false as const, error: "Only the main admin can manage invites." };
  }
  const email = normalizeEmail(inviteEmail);
  state.adminInvites = state.adminInvites.filter((e) => e !== email);
  const existing = state.accounts.find((a) => a.email === email);
  if (existing && !isMainAdminEmail(email)) existing.role = "tourist";
  bump(state);
  return { ok: true as const, invites: state.adminInvites };
}

export async function listAdminInvites(actorEmail: string) {
  const state = await ensureStore();
  if (resolveRole(actorEmail, state.adminInvites) !== "admin") {
    return { ok: false as const, error: "Admins only." };
  }
  return {
    ok: true as const,
    invites: state.adminInvites,
    mainAdmin: isMainAdminEmail(actorEmail),
    admins: state.accounts
      .filter((a) => a.role === "admin")
      .map(({ passwordHash: _, ...a }) => a),
  };
}

export async function assertAdmin(email: string) {
  const state = await ensureStore();
  if (resolveRole(email, state.adminInvites) !== "admin") {
    throw new Error("Admin access required.");
  }
  return state;
}

export async function createBookingRecord(input: {
  listingId: string;
  guests: number;
  date: string;
  total: number;
  customer: string;
  customerEmail?: string;
  customerPhone?: string;
  notifyPreference?: NotifyPreference;
}): Promise<Booking> {
  const state = await ensureStore();
  const listing = state.listings.find((l) => l.id === input.listingId);
  if (!listing) throw new Error("Listing not found");
  const ref = `EXH-${Math.floor(1000 + Math.random() * 8999)}-${listing.destination
    .slice(0, 3)
    .toUpperCase()}`;
  const booking: Booking = {
    id: crypto.randomUUID(),
    reference: ref,
    listingId: listing.id,
    listingTitle: listing.title,
    kind: listing.kind,
    image: listing.images[0] ?? "",
    guests: input.guests,
    date: input.date,
    total: input.total,
    status: "pending",
    paid: false,
    customer: input.customer,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    notifyPreference: input.notifyPreference ?? "call",
    createdAt: new Date().toISOString(),
    statusUpdatedAt: new Date().toISOString(),
  };
  state.bookings.unshift(booking);
  bump(state);
  await mirrorBooking(booking);
  return booking;
}

/** Write the booking into the real Supabase table so admins see it in the dashboard/DB. */
async function mirrorBooking(booking: Booking) {
  if (!supabaseConfigured()) return;
  try {
    await upsertBookingRow({
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
      customer_phone: booking.customerPhone ?? null,
      notify_preference: booking.notifyPreference ?? "call",
      status_updated_at: booking.statusUpdatedAt ?? null,
      approved_at: booking.approvedAt ?? null,
      rejected_at: booking.rejectedAt ?? null,
      status_by: booking.statusBy ?? null,
      admin_note: booking.adminNote ?? null,
      created_at: booking.createdAt ?? new Date().toISOString(),
    });
  } catch {
    // Non-fatal: the booking still lives in the hub document.
  }
}


export async function setBookingStatus(
  id: string,
  status: BookingStatus,
  options: { note?: string; actorEmail?: string } = {},
) {
  const state = await ensureStore();
  const booking = state.bookings.find((b) => b.id === id);
  if (!booking) throw new Error("Booking not found");
  const now = new Date().toISOString();
  booking.status = status;
  booking.statusUpdatedAt = now;
  if (options.actorEmail) booking.statusBy = normalizeEmail(options.actorEmail);
  if (options.note !== undefined) booking.adminNote = options.note.trim() || undefined;
  if (status === "approved" || status === "confirmed") booking.approvedAt = now;
  if (status === "rejected" || status === "cancelled") booking.rejectedAt = now;
  bump(state);
  await mirrorBooking(booking);
  return {
    id,
    status,
    statusUpdatedAt: booking.statusUpdatedAt,
    approvedAt: booking.approvedAt,
    rejectedAt: booking.rejectedAt,
    adminNote: booking.adminNote,
    statusBy: booking.statusBy,
  };
}

/** Live feed straight from the Supabase `bookings` table (falls back to hub state). */
export async function getBookingFeed(limit = 25) {
  const state = await ensureStore();
  if (supabaseConfigured()) {
    try {
      const rows = await listBookingRows(limit);
      if (rows.length) {
        return {
          source: "supabase" as const,
          bookings: rows.map((r) => ({
            id: String(r["id"]),
            reference: String(r["reference"] ?? ""),
            listingTitle: String(r["listing_title"] ?? ""),
            customer: String(r["customer"] ?? ""),
            customerEmail: (r["customer_email"] as string | null) ?? undefined,
            customerPhone: (r["customer_phone"] as string | null) ?? undefined,
            guests: Number(r["guests"] ?? 1),
            date: String(r["date"] ?? ""),
            total: Number(r["total"] ?? 0),
            status: String(r["status"] ?? "pending") as BookingStatus,
            adminNote: (r["admin_note"] as string | null) ?? undefined,
            createdAt: String(r["created_at"] ?? ""),
            statusUpdatedAt: (r["status_updated_at"] as string | null) ?? undefined,
          })),
        };
      }
    } catch {
      // fall through to hub state
    }
  }
  return {
    source: "local" as const,
    bookings: state.bookings.slice(0, limit).map((b) => ({
      id: b.id,
      reference: b.reference,
      listingTitle: b.listingTitle,
      customer: b.customer,
      customerEmail: b.customerEmail,
      customerPhone: b.customerPhone,
      guests: b.guests,
      date: b.date,
      total: b.total,
      status: b.status,
      adminNote: b.adminNote,
      createdAt: b.createdAt ?? "",
      statusUpdatedAt: b.statusUpdatedAt,
    })),
  };
}

/** Persist an account permanently in the Supabase `accounts` table. */
async function mirrorAccount(account: HubAccount) {
  if (!supabaseConfigured()) return;
  try {
    await upsertAccountRow({
      email: account.email,
      name: account.name,
      role: account.role,
      picture: account.picture ?? null,
      notify_preference: account.notifyPreference ?? "call",
      contact_number: account.contactNumber ?? null,
      created_at: account.createdAt,
      updated_at: new Date().toISOString(),
    });
  } catch {
    // Non-fatal: the account still lives in the hub document.
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
    destination: input.destination.trim(),
    country: input.country.trim() || "Palawan",
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
    seatsLeft: input.seatsLeft,
    discountPct: input.discountPct,
    featured: !!input.featured,
    status: input.status ?? "approved",
    businessName: input.businessName.trim() || input.title.trim(),
    createdAt: new Date().toISOString().slice(0, 10),
    coords: { lat: 11.031, lng: 119.4 },
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
  };
  state.listings.unshift(listing);
  bump(state);
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
  if (patch.title !== undefined) listing.title = patch.title.trim();
  if (patch.tagline !== undefined) listing.tagline = patch.tagline.trim();
  if (patch.description !== undefined) listing.description = patch.description.trim();
  if (patch.destination !== undefined) listing.destination = patch.destination.trim();
  if (patch.country !== undefined) listing.country = patch.country.trim();
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
  if (patch.seatsLeft !== undefined) listing.seatsLeft = patch.seatsLeft;
  if (patch.discountPct !== undefined) listing.discountPct = patch.discountPct;
  if (patch.inclusions !== undefined) listing.inclusions = patch.inclusions;
  if (patch.exclusions !== undefined) listing.exclusions = patch.exclusions;
  if (patch.itinerary !== undefined) listing.itinerary = patch.itinerary;
  if (patch.rooms !== undefined) listing.rooms = patch.rooms;
  if (patch.menu !== undefined) listing.menu = patch.menu;
  if (patch.cancellationPolicy !== undefined) listing.cancellationPolicy = patch.cancellationPolicy;
  bump(state);
  return listing;
}

export async function deleteListingRecord(actorEmail: string, id: string) {
  const state = await assertAdmin(actorEmail);
  const before = state.listings.length;
  state.listings = state.listings.filter((l) => l.id !== id);
  if (state.listings.length === before) throw new Error("Listing not found");
  bump(state);
  return { id };
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
  return testimonial;
}

export async function deleteTestimonialRecord(actorEmail: string, id: string) {
  const state = await assertAdmin(actorEmail);
  state.testimonials = state.testimonials.filter((t) => t.id !== id);
  bump(state);
  return { id };
}
