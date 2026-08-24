/**
 * Minimal PostgREST client for the project's own Supabase instance.
 * Server-only: uses the service role key, never exposed to the browser.
 * Uses plain fetch so it runs on Cloudflare Workers with zero dependencies.
 */

import { firstEnv } from "@/lib/worker-env";

const FALLBACK_URL = "https://aeynekfhnzjcimskwouw.supabase.co";

function config() {
  const url =
    firstEnv(
      "NEXORA_SUPABASE_URL",
      "EXPLOREHUB_SUPABASE_URL",
      "SUPABASE_URL",
      "VITE_SUPABASE_URL",
    ) || FALLBACK_URL;
  const key = firstEnv(
    "NEXORA_SUPABASE_SERVICE_ROLE_KEY",
    "EXPLOREHUB_SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  if (!key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

export function supabaseConfigured() {
  return config() !== null;
}

export function supabaseMissingConfigMessage() {
  return "Account services are temporarily unavailable. Please try again in a few minutes.";
}

async function rest(path: string, init: RequestInit = {}) {
  const cfg = config();
  if (!cfg) throw new Error("Account services are not configured");
  const headers = new Headers(init.headers);
  headers.set("apikey", cfg.key);
  headers.set("Authorization", `Bearer ${cfg.key}`);
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase [${res.status}] ${body}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** Read the whole hub document (state JSON + revision). */
export async function readHubDocument<T>(): Promise<{ data: T; revision: number } | null> {
  const rows = (await rest(
    "hub_state?id=eq.main&select=data,revision",
  )) as { data: T; revision: number }[] | null;
  if (!rows?.length) return null;
  return { data: rows[0].data, revision: Number(rows[0].revision) };
}

/** Cheap revision read used by the realtime poller. */
export async function readHubRevision(): Promise<number | null> {
  const rows = (await rest("hub_state?id=eq.main&select=revision")) as
    | { revision: number }[]
    | null;
  if (!rows?.length) return null;
  return Number(rows[0].revision);
}

export async function writeHubDocument(data: unknown, revision: number) {
  await rest("hub_state?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([
      { id: "main", data, revision, updated_at: new Date().toISOString() },
    ]),
  });
}

/**
 * Cached capability probe: some projects still have the legacy `bookings`
 * table (owner_id/user_id/booking_date, no `customer`), where every mirror
 * write fails. Detect it once so reservations are not re-attempted (and
 * error-logged) on every admin poll — the hub document remains the source
 * of truth until `supabase/bookings-repair.sql` is applied.
 */
let bookingsTableUsable: boolean | null = null;

export async function bookingsTableSupported(): Promise<boolean> {
  if (bookingsTableUsable !== null) return bookingsTableUsable;
  try {
    await rest("bookings?select=customer,listing_title,kind&limit=1");
    bookingsTableUsable = true;
  } catch {
    bookingsTableUsable = false;
    console.warn(
      "[bookings] Supabase `bookings` table is missing app columns — run supabase/bookings-repair.sql. Reservations still persist in hub_state.",
    );
  }
  return bookingsTableUsable;
}

/** Mirror a booking into a real table so it is visible/queryable in Supabase. */
export async function upsertBookingRow(row: Record<string, unknown>) {
  if (!(await bookingsTableSupported())) return;
  await rest("bookings?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([row]),
  });
}

/** Cached: some projects never ran the password_hash migration. */
let accountsPasswordHashSupported: boolean | null = null;

function isMissingPasswordHashColumn(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("PGRST204") && message.includes("password_hash");
}

function accountRowPayload(row: Record<string, unknown>, includePasswordHash: boolean) {
  const payload: Record<string, unknown> = { ...row };
  if (!includePasswordHash || !payload.password_hash) {
    delete payload.password_hash;
  }
  return payload;
}

/** Persist an account row so every sign-up lives permanently in Supabase. */
export async function upsertAccountRow(row: Record<string, unknown>) {
  const email = encodeURIComponent(String(row.email ?? ""));
  const wantPassword =
    accountsPasswordHashSupported !== false &&
    typeof row.password_hash === "string" &&
    row.password_hash.length > 0;

  const write = async (includePasswordHash: boolean) => {
    const payload = accountRowPayload(row, includePasswordHash);
    try {
      await rest("accounts?on_conflict=email", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify([payload]),
      });
    } catch (error) {
      if (includePasswordHash && isMissingPasswordHashColumn(error)) throw error;
      // Some projects already have the row (e.g. admin seed) — patch it in place.
      await rest(`accounts?email=eq.${email}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    }
  };

  try {
    await write(wantPassword);
    if (wantPassword) accountsPasswordHashSupported = true;
  } catch (error) {
    if (wantPassword && isMissingPasswordHashColumn(error)) {
      accountsPasswordHashSupported = false;
      await write(false);
      return;
    }
    throw error;
  }
}

/** Look up one account by email — used so sign-in is not limited to this Worker isolate. */
export async function readAccountRow(email: string): Promise<Record<string, unknown> | null> {
  const encoded = encodeURIComponent(email);
  const rows = (await rest(
    `accounts?email=eq.${encoded}&select=*&limit=1`,
  )) as Record<string, unknown>[] | null;
  return rows?.[0] ?? null;
}

/** All registered accounts for the admin customers directory. */
export async function listAccountRows(limit = 1000): Promise<Record<string, unknown>[]> {
  const rows = (await rest(
    `accounts?select=email,name,role,created_at,picture&order=created_at.desc&limit=${limit}`,
  )) as Record<string, unknown>[] | null;
  return rows ?? [];
}

/** Permanently delete a registered account (main-admin customer removal). */
export async function deleteAccountRow(email: string) {
  const encoded = encodeURIComponent(email.trim().toLowerCase());
  await rest(`accounts?email=eq.${encoded}`, { method: "DELETE" });
}

/** Read the newest booking rows straight from Supabase for the live admin feed. */
export async function listBookingRows(limit = 30): Promise<Record<string, unknown>[]> {
  const rows = (await rest(
    `bookings?select=*&order=created_at.desc&limit=${limit}`,
  )) as Record<string, unknown>[] | null;
  return rows ?? [];
}

/** Read all booking rows for admin dashboards and revenue reporting. */
export async function listAllBookingRows(limit = 500): Promise<Record<string, unknown>[]> {
  const rows = (await rest(
    `bookings?select=*&order=created_at.desc&limit=${limit}`,
  )) as Record<string, unknown>[] | null;
  return rows ?? [];
}

/** Read bookings for one traveller email. */
export async function listBookingRowsByEmail(
  email: string,
  limit = 100,
): Promise<Record<string, unknown>[]> {
  const encoded = encodeURIComponent(email.trim().toLowerCase());
  const rows = (await rest(
    `bookings?customer_email=eq.${encoded}&select=*&order=created_at.desc&limit=${limit}`,
  )) as Record<string, unknown>[] | null;
  return rows ?? [];
}

/** Wipe every row from the bookings table (main-admin revenue reset). */
export async function deleteAllBookingRows() {
  await rest("bookings?created_at=lt.2099-12-31", { method: "DELETE" });
  const leftover = await listAllBookingRows(500);
  if (!leftover.length) return;
  const ids = leftover
    .map((row) => String(row.id ?? ""))
    .filter((id) => id && id !== "undefined");
  if (!ids.length) return;
  const encoded = ids.join(",");
  await rest(`bookings?id=in.(${encoded})`, { method: "DELETE" });
}

/** Remove seeded demo reservations from the real bookings table. */
export async function deleteDemoBookingRows(references: string[]) {
  if (!references.length) return;
  const quoted = references.map((r) => `"${r.replace(/"/g, "")}"`).join(",");
  await rest(`bookings?reference=in.(${quoted})`, { method: "DELETE" });
}

/** Look up one reservation by its public reference code. */
export async function listBookingRowsByReference(
  reference: string,
): Promise<Record<string, unknown>[]> {
  const ref = reference.trim();
  const encoded = encodeURIComponent(ref);
  const rows = (await rest(
    `bookings?reference=eq.${encoded}&select=*&limit=1`,
  )) as Record<string, unknown>[] | null;
  if (rows?.length) return rows;

  const ilike = encodeURIComponent(ref);
  const fallback = (await rest(
    `bookings?reference=ilike.${ilike}&select=*&limit=1`,
  )) as Record<string, unknown>[] | null;
  return fallback ?? [];
}

/** Scan the hub document JSON for a reservation when the bookings table is empty or unavailable. */
export async function findBookingInHubDocument(
  reference: string,
): Promise<Record<string, unknown> | null> {
  const ref = reference.trim().toLowerCase();
  if (!ref) return null;
  const rows = (await rest("hub_state?id=eq.main&select=data&limit=1")) as
    | { data: { bookings?: Record<string, unknown>[] } }[]
    | null;
  const bookings = rows?.[0]?.data?.bookings;
  if (!Array.isArray(bookings)) return null;
  return (
    bookings.find(
      (row) => String(row.reference ?? "").trim().toLowerCase() === ref,
    ) ?? null
  );
}

/** Favourites mirrored as real rows (email + listing_id). Service role only. */
export async function upsertFavoriteRow(email: string, listingId: string) {
  await rest("favorites?on_conflict=email,listing_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([
      {
        email: email.trim().toLowerCase(),
        listing_id: listingId,
        created_at: new Date().toISOString(),
      },
    ]),
  });
}

/** Mirror public listings (availability + core fields) for admin SQL visibility. */
export async function upsertListingRow(row: Record<string, unknown>) {
  await rest("listing_catalog?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([row]),
  });
}

export async function deleteListingRow(id: string) {
  const encoded = encodeURIComponent(id);
  await rest(`listing_catalog?id=eq.${encoded}`, { method: "DELETE" });
}

/** Mirror global travel package tiers for SQL visibility. */
export async function upsertTravelPackageRow(row: Record<string, unknown>) {
  await rest("travel_packages?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([row]),
  });
}

export async function deleteTravelPackageRow(id: string) {
  const encoded = encodeURIComponent(id);
  await rest(`travel_packages?id=eq.${encoded}`, { method: "DELETE" });
}

export async function deleteFavoriteRow(email: string, listingId: string) {
  const encodedEmail = encodeURIComponent(email.trim().toLowerCase());
  const encodedListing = encodeURIComponent(listingId);
  await rest(`favorites?email=eq.${encodedEmail}&listing_id=eq.${encodedListing}`, {
    method: "DELETE",
  });
}

export async function deleteFavoriteRowsForEmail(email: string) {
  const encoded = encodeURIComponent(email.trim().toLowerCase());
  await rest(`favorites?email=eq.${encoded}`, { method: "DELETE" });
}

export async function listFavoriteListingIds(email: string): Promise<string[]> {
  const encoded = encodeURIComponent(email.trim().toLowerCase());
  const rows = (await rest(
    `favorites?email=eq.${encoded}&select=listing_id&order=created_at.desc&limit=500`,
  )) as { listing_id?: string }[] | null;
  if (!rows?.length) return [];
  return rows.map((r) => String(r.listing_id ?? "")).filter(Boolean);
}

