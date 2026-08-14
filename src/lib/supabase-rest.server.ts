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
  return "Account database is not connected. Set NEXORA_SUPABASE_SERVICE_ROLE_KEY on your Cloudflare Worker: run `wrangler secret put NEXORA_SUPABASE_SERVICE_ROLE_KEY` (or add it as a GitHub Actions secret so deploy syncs it), then redeploy. Use the service_role key from Supabase → Project Settings → API.";
}

async function rest(path: string, init: RequestInit = {}) {
  const cfg = config();
  if (!cfg) throw new Error("Supabase is not configured");
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

/** Mirror a booking into a real table so it is visible/queryable in Supabase. */
export async function upsertBookingRow(row: Record<string, unknown>) {
  await rest("bookings?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([row]),
  });
}

/** Persist an account row so every sign-up lives permanently in Supabase. */
export async function upsertAccountRow(row: Record<string, unknown>) {
  try {
    await rest("accounts?on_conflict=email", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify([row]),
    });
  } catch (error) {
    if (!("password_hash" in row)) throw error;
    const { password_hash: _passwordHash, ...withoutHash } = row;
    await rest("accounts?on_conflict=email", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify([withoutHash]),
    });
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

/** Read the newest booking rows straight from Supabase for the live admin feed. */
export async function listBookingRows(limit = 30): Promise<Record<string, unknown>[]> {
  const rows = (await rest(
    `bookings?select=*&order=created_at.desc&limit=${limit}`,
  )) as Record<string, unknown>[] | null;
  return rows ?? [];
}

/** Keep-alive ping — a tiny read that prevents the project from idling out. */
export async function pingSupabase() {
  const started = Date.now();
  const revision = await readHubRevision();
  return { ok: true as const, revision, ms: Date.now() - started };
}
