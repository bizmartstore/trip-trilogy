/**
 * Compact app store for Cloudflare Worker / Node.
 * Images are stored as text (data URLs), not blob storage — keeps quota low.
 * Revision bumps on every mutation so clients can poll cheaply for realtime updates.
 */
import { destinations as seedDestinations, demoBookings, listings as seedListings } from "@/data/catalog";
import { isMainAdminEmail, normalizeEmail } from "@/lib/constants";
import type {
  Booking,
  BookingStatus,
  Destination,
  HubAccount,
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
}

const GLOBAL_KEY = "__explorehub_store_v1__";

type GlobalStore = typeof globalThis & {
  [GLOBAL_KEY]?: HubState;
  __explorehub_persist_timer?: ReturnType<typeof setTimeout>;
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
  };
}

function getMemory(): HubState {
  const g = globalThis as GlobalStore;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = emptySeed();
  return g[GLOBAL_KEY]!;
}

let hydratePromise: Promise<void> | null = null;

async function hydrateFromDisk() {
  try {
    const [{ readFile }, path] = await Promise.all([
      import("node:fs/promises"),
      import("node:path"),
    ]);
    const file = path.join(process.cwd(), ".data", "hub-store.json");
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as HubState;
    if (parsed?.listings && parsed?.bookings) {
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
      };
    }
  } catch {
    // No file yet or Cloudflare Worker (no durable FS) — keep memory seed.
  }
}

function schedulePersist() {
  const g = globalThis as GlobalStore;
  if (g.__explorehub_persist_timer) clearTimeout(g.__explorehub_persist_timer);
  g.__explorehub_persist_timer = setTimeout(() => {
    void persistToDisk();
  }, 250);
}

async function persistToDisk() {
  try {
    const [{ mkdir, writeFile }, path] = await Promise.all([
      import("node:fs/promises"),
      import("node:path"),
    ]);
    const file = path.join(process.cwd(), ".data", "hub-store.json");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(getMemory()), "utf8");
  } catch {
    // Cloudflare Workers have no durable FS — memory store still serves warm isolates.
  }
}

export async function ensureStore(): Promise<HubState> {
  if (!hydratePromise) hydratePromise = hydrateFromDisk();
  await hydratePromise;
  return getMemory();
}

function bump(state: HubState) {
  state.revision += 1;
  schedulePersist();
}

export async function getRevision() {
  const state = await ensureStore();
  return state.revision;
}

export async function getSnapshot() {
  return ensureStore();
}

export function resolveRole(email: string, invites: string[]): "tourist" | "admin" {
  const e = normalizeEmail(email);
  if (isMainAdminEmail(e)) return "admin";
  if (invites.includes(e)) return "admin";
  return "tourist";
}

export async function hashPassword(password: string) {
  const data = new TextEncoder().encode(`explorehub:${password}`);
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
    createdAt: new Date().toISOString(),
  };
  state.bookings.unshift(booking);
  bump(state);
  return booking;
}

export async function setBookingStatus(id: string, status: BookingStatus) {
  const state = await ensureStore();
  const booking = state.bookings.find((b) => b.id === id);
  if (!booking) throw new Error("Booking not found");
  booking.status = status;
  bump(state);
  return { id, status };
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
              '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect fill="#0b2b2b" width="100%" height="100%"/><text x="50%" y="50%" fill="#c9a96e" font-size="28" text-anchor="middle" dy=".3em">ExploreHub</text></svg>',
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
