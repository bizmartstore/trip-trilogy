/**
 * Signed HTTP-only session cookies backed by Supabase account rows.
 * The browser never stores credentials — only a signed session token.
 */
import { normalizeEmail } from "@/lib/constants";
import { readAccountRow } from "@/lib/supabase-rest.server";
import { firstEnv } from "@/lib/worker-env";

const COOKIE_NAME = "nexora_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 30;

function sessionSecret(): string {
  return firstEnv(
    "NEXORA_SESSION_SECRET",
    "NEXORA_SUPABASE_SERVICE_ROLE_KEY",
    "EXPLOREHUB_SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  );
}

async function hmacSign(payload: string): Promise<string> {
  const secret = sessionSecret();
  if (!secret) throw new Error("Session secret is not configured on the Worker.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function encodePayload(email: string, exp: number) {
  const json = JSON.stringify({ email: normalizeEmail(email), exp });
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodePayload(encoded: string): { email: string; exp: number } | null {
  try {
    const json = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    const data = JSON.parse(json) as { email?: string; exp?: number };
    if (!data.email || typeof data.exp !== "number") return null;
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return { email: normalizeEmail(data.email), exp: data.exp };
  } catch {
    return null;
  }
}

export async function createSessionToken(email: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC;
  const encoded = encodePayload(email, exp);
  const signature = await hmacSign(encoded);
  return `${encoded}.${signature}`;
}

export async function parseSessionToken(token: string): Promise<{ email: string } | null> {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = await hmacSign(encoded);
  if (expected !== signature) return null;
  const payload = decodePayload(encoded);
  return payload ? { email: payload.email } : null;
}

export function sessionCookieHeader(token: string, request?: Request): string {
  const secure = request?.url.startsWith("https://") ?? true;
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_SEC}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookieHeader(request?: Request): string {
  const secure = request?.url.startsWith("https://") ?? true;
  const parts = [`${COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export async function getSessionUser(request: Request) {
  const token = readSessionCookie(request);
  if (!token) return null;
  const session = await parseSessionToken(token);
  if (!session) return null;

  const row = await readAccountRow(session.email);
  if (!row) return null;

  return {
    name: String(row.name ?? session.email.split("@")[0]),
    email: session.email,
    role: row.role === "admin" ? ("admin" as const) : ("tourist" as const),
    picture: typeof row.picture === "string" && row.picture ? row.picture : undefined,
  };
}

export function jsonWithSession(body: unknown, token: string, request: Request, status = 200) {
  return Response.json(body, {
    status,
    headers: { "set-cookie": sessionCookieHeader(token, request) },
  });
}
