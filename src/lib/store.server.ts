/**
 * Compact app store for Cloudflare Worker / Node.
 * Durable state lives in the project's own Supabase instance (`hub_state` document),
 * with every booking mirrored into a real `bookings` table for admin visibility.
 * Revision bumps on every mutation so clients poll cheaply for realtime updates.
 */
import { destinations as seedDestinations, listings as seedListings } from "@/data/catalog";
import { isMainAdminEmail, normalizeEmail } from "@/lib/constants";
import {
  deleteDemoBookingRows,
  findBookingInHubDocument,
  listAllBookingRows,
  listBookingRows,
  listBookingRowsByEmail,
  listBookingRowsByReference,
  readAccountRow,
  readHubDocument,
  readHubRevision,
  supabaseConfigured,
  supabaseMissingConfigMessage,
  upsertAccountRow,
  upsertBookingRow,
  writeHubDocument,
} from "@/lib/supabase-rest.server";
import { keepAlive } from "@/lib/worker-env";
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
  ListingKind,
  Review,
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
  notifications: HubNotification[];
  /** Saved listing ids keyed by traveller email. */
  favorites: Record<string, string[]>;
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

/** Strip demo reservations shipped with early seeds. */
function sanitizeDemoBookings(bookings: Booking[]) {
  return bookings.filter((b) => !isDemoBooking(b));
}

function rowToBooking(row: Record<string, unknown>, listings: Listing[]): Booking {
  const listingId = String(row["listing_id"] ?? row["listingId"] ?? "");
  const listing = listings.find((l) => l.id === listingId);
  return {
    id: String(row["id"]),
    reference: String(row["reference"] ?? ""),
    listingId,
    listingTitle: String(row["listing_title"] ?? row["listingTitle"] ?? ""),
    kind: String(row["kind"] ?? "tour") as ListingKind,
    image: String(row["image"] ?? listing?.images[0] ?? ""),
    guests: Number(row["guests"] ?? 1),
    date: String(row["date"] ?? ""),
    total: Number(row["total"] ?? 0),
    status: String(row["status"] ?? "pending") as BookingStatus,
    paid: Boolean(row["paid"]),
    customer: String(row["customer"] ?? ""),
    customerEmail: (row["customer_email"] as string | null | undefined) ?? (row["customerEmail"] as string | undefined),
    customerPhone: (row["customer_phone"] as string | null | undefined) ?? (row["customerPhone"] as string | undefined),
    notifyPreference: (row["notify_preference"] as NotifyPreference | null | undefined) ?? (row["notifyPreference"] as NotifyPreference | undefined),
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
    guests: booking.guests,
    date: booking.date,
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

/** Merge hub document bookings with Supabase table rows (table wins on id conflict). */
async function mergeAllBookings(): Promise<Booking[]> {
  await ensureStore();
  await refreshStoreBookings();
  const state = getMemory();
  const merged = new Map<string, Booking>();

  for (const booking of sanitizeDemoBookings(state.bookings)) {
    merged.set(booking.id, booking);
  }

  if (supabaseConfigured()) {
    try {
      const doc = await readHubDocument<Partial<HubState>>();
      const hubBookings = doc?.data?.bookings ?? [];
      for (const raw of hubBookings) {
        if (!raw || typeof raw !== "object") continue;
        const booking = rowToBooking(raw as Record<string, unknown>, state.listings);
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
  }

  return sortBookingsNewestFirst(Array.from(merged.values()));
}

async function backfillBookingsTable(bookings: Booking[]) {
  if (!supabaseConfigured() || !bookings.length) return;
  keepAlive(
    (async () => {
      for (const booking of bookings) {
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

function emptySeed(): HubState {
  const listings = structuredClone(seedListings);
  sanitizeSeedReviews(listings);
  return {
    revision: 1,
    listings,
    bookings: [],
    destinations: structuredClone(seedDestinations),
    accounts: [],
    adminInvites: [],
    testimonials: [],
    settings: { ...defaultSettings },
    notifications: [],
    favorites: {},
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
  const g = globalThis as GlobalStore;
  g[GLOBAL_KEY] = {
    revision: parsed.revision ?? 1,
    listings,
    bookings: sanitizeDemoBookings(parsed.bookings ?? []),
    destinations: parsed.destinations?.length
      ? parsed.destinations
      : structuredClone(seedDestinations),
    accounts: parsed.accounts ?? [],
    adminInvites: (parsed.adminInvites ?? []).map(normalizeEmail),
    testimonials: parsed.testimonials ?? [],
    settings: { ...defaultSettings, ...(parsed.settings ?? {}) },
    notifications: parsed.notifications ?? [],
    favorites: parsed.favorites ?? {},
  };
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
      const synced = rows.map((row) => rowToBooking(row, state.listings));
      const merged = new Map(state.bookings.map((b) => [b.id, b]));
      for (const booking of synced) merged.set(booking.id, booking);
      const mergedList = sanitizeDemoBookings(Array.from(merged.values()));
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
  await writeHubDocument(state, state.revision);
}

export async function ensureStore(): Promise<HubState> {
  if (!hydratePromise) hydratePromise = hydrateFromRemote();
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
    role: base.role ?? "tourist",
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
  merged.role = resolveRole(normalized, getMemory().adminInvites);
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

  const role = resolveRole(email, state.adminInvites);
  const account: HubAccount = {
    email,
    name: input.name.trim() || existing?.name || email.split("@")[0],
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
  const role = resolveRole(email, state.adminInvites);
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
}): Promise<Omit<HubAccount, "passwordHash">> {
  if (!supabaseConfigured()) {
    throw new Error(supabaseMissingConfigMessage());
  }
  const state = await ensureStore();
  const email = normalizeEmail(input.email);
  const role = resolveRole(email, state.adminInvites);
  let account = await findAccount(email);
  if (!account) {
    account = {
      email,
      name: input.name.trim() || email.split("@")[0],
      passwordHash: await hashPassword(crypto.randomUUID()),
      role,
      picture: input.picture,
      createdAt: new Date().toISOString(),
    };
  } else {
    account.name = input.name.trim() || account.name;
    account.picture = input.picture ?? account.picture;
    account.role = role;
  }
  rememberAccount(account);
  if (role === "admin" && !isMainAdminEmail(email)) {
    state.adminInvites = state.adminInvites.filter((e) => e !== email);
  }
  await bumpAndWait(state);
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
  const { syncEnvFromGlobal } = await import("@/lib/worker-env");
  syncEnvFromGlobal();

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
  if (input.customerEmail) {
    pushNotification(state, {
      email: input.customerEmail,
      title: "Booking submitted",
      body: `${listing.title} (${ref}) for ${input.date} — pending approval.`,
      link: "/dashboard",
      kind: "booking",
    });
  }
  await bumpAndWait(state);
  await mirrorBooking(booking);
  return booking;
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

  const fullRow = {
    ...minimalRow,
    customer_phone: booking.customerPhone ?? null,
    notify_preference: booking.notifyPreference ?? "call",
    status_updated_at: booking.statusUpdatedAt ?? null,
    approved_at: booking.approvedAt ?? null,
    rejected_at: booking.rejectedAt ?? null,
    status_by: booking.statusBy ?? null,
    admin_note: booking.adminNote ?? null,
  };

  try {
    await upsertBookingRow(fullRow);
    return;
  } catch (err) {
    console.error("[booking] full mirror failed:", booking.reference, err);
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
  if (status === "approved" || status === "confirmed" || status === "completed") {
    booking.approvedAt = now;
    booking.paid = true;
  }
  if (status === "rejected" || status === "cancelled") {
    booking.rejectedAt = now;
    booking.paid = false;
  }

  const email = booking.customerEmail?.trim().toLowerCase();
  if (email) {
    const labels: Record<BookingStatus, string> = {
      pending: "Booking received",
      approved: "Booking approved",
      confirmed: "Booking confirmed",
      completed: "Trip completed",
      cancelled: "Booking cancelled",
      rejected: "Booking declined",
    };
    const bodies: Record<BookingStatus, string> = {
      pending: `${booking.listingTitle} (${booking.reference}) is awaiting review.`,
      approved: `${booking.listingTitle} — ${booking.reference} was approved. Our team will reach out soon.`,
      confirmed: `${booking.listingTitle} — ${booking.reference} is confirmed for ${booking.date}.`,
      completed: `We hope you enjoyed ${booking.listingTitle}. Leave a review when you have a moment.`,
      cancelled: `${booking.listingTitle} (${booking.reference}) was cancelled.`,
      rejected: `${booking.listingTitle} (${booking.reference}) could not be confirmed.${
        options.note ? ` ${options.note}` : ""
      }`,
    };
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

/** Live feed — merges Supabase table rows with hub document reservations. */
export async function getBookingFeed(limit = 25) {
  const { syncEnvFromGlobal } = await import("@/lib/worker-env");
  syncEnvFromGlobal();

  const merged = await mergeAllBookings();
  void backfillBookingsTable(merged);

  let tableCount = 0;
  if (supabaseConfigured()) {
    try {
      tableCount = (await listBookingRows(limit)).length;
    } catch {
      tableCount = 0;
    }
  }

  const bookings = merged.slice(0, limit).map(mapBookingToFeed);
  return {
    source: tableCount > 0 ? ("supabase" as const) : merged.length ? ("local" as const) : ("supabase" as const),
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

/** Traveller dashboard bookings — prefers Supabase rows for the signed-in email. */
export async function getBookingsForEmail(email: string): Promise<Booking[]> {
  const state = await ensureStore();
  const key = normalizeEmail(email);
  if (supabaseConfigured()) {
    try {
      const rows = await listBookingRowsByEmail(key);
      if (rows.length) return rows.map((row) => rowToBooking(row, state.listings));
    } catch {
      // fall through
    }
  }
  return sanitizeDemoBookings(state.bookings).filter(
    (b) =>
      b.customerEmail?.toLowerCase() === key ||
      b.customer.toLowerCase() === key.split("@")[0].toLowerCase(),
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
      if (rows[0]) return rowToBooking(rows[0], state.listings);
    } catch (error) {
      console.error("[booking] table lookup failed:", error);
    }

    try {
      const hubRow = await findBookingInHubDocument(ref);
      if (hubRow) return rowToBooking(hubRow, state.listings);
    } catch (error) {
      console.error("[booking] hub document lookup failed:", error);
    }
  }

  return (
    sanitizeDemoBookings(state.bookings).find(
      (b) => b.reference.toLowerCase() === refKey,
    ) ?? null
  );
}

/** Persist an account permanently in the Supabase `accounts` table. */
async function mirrorAccount(account: HubAccount, required = false) {
  if (!supabaseConfigured()) {
    if (required) throw new Error("Supabase is not configured");
    return;
  }
  if (!account.passwordHash) return;
  try {
    await upsertAccountRow({
      email: account.email,
      name: account.name,
      role: account.role,
      picture: account.picture ?? null,
      notify_preference: account.notifyPreference ?? "call",
      contact_number: account.contactNumber ?? null,
      password_hash: account.passwordHash,
      created_at: account.createdAt,
      updated_at: new Date().toISOString(),
    });
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
  if (!state.favorites) state.favorites = {};
  const list = state.favorites[key] ?? [];
  const idx = list.indexOf(listingId);
  if (idx >= 0) {
    list.splice(idx, 1);
    state.favorites[key] = list;
    bump(state);
    return { saved: false, listingIds: list };
  }
  state.favorites[key] = [listingId, ...list];
  bump(state);
  return { saved: true, listingIds: state.favorites[key] };
}

export async function listFavorites(email: string) {
  const state = await ensureStore();
  const ids = state.favorites?.[normalizeEmail(email)] ?? [];
  return state.listings.filter((l) => ids.includes(l.id));
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

  const targets = input.targetEmail?.trim()
    ? [normalizeEmail(input.targetEmail)]
    : state.accounts.filter((a) => a.role === "tourist").map((a) => a.email);

  if (!targets.length) throw new Error("No travellers to notify yet.");

  for (const email of targets) {
    pushNotification(state, {
      email,
      title,
      body,
      link: input.link?.trim() || "/dashboard",
      kind: "message",
    });
  }
  bump(state);
  return { sent: targets.length };
}
