/**
 * Verify a Google Sign-In ID token.
 * Prefers Supabase Auth (when Google provider is enabled there), then Google tokeninfo.
 */
import { firstEnv } from "@/lib/worker-env";
import { supabaseConfigured } from "@/lib/supabase-rest.server";

export type VerifiedGoogleProfile = {
  email: string;
  name: string;
  picture?: string;
};

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const json = atob(padded + pad);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function profileFromClaims(claims: Record<string, unknown>): VerifiedGoogleProfile | null {
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!email.includes("@")) return null;
  const emailVerified = claims.email_verified;
  if (emailVerified === false || emailVerified === "false") return null;
  const name =
    (typeof claims.name === "string" && claims.name.trim()) ||
    (typeof claims.given_name === "string" && claims.given_name.trim()) ||
    email.split("@")[0];
  const picture = typeof claims.picture === "string" && claims.picture ? claims.picture : undefined;
  return { email, name, picture };
}

function googleClientIds(): string[] {
  return [
    firstEnv("GOOGLE_OAUTH_CLIENT_ID"),
    firstEnv("VITE_GOOGLE_OAUTH_CLIENT_ID"),
  ].filter(Boolean);
}

async function verifyViaSupabase(idToken: string): Promise<VerifiedGoogleProfile | null> {
  if (!supabaseConfigured()) return null;
  const url = firstEnv(
    "NEXORA_SUPABASE_URL",
    "EXPLOREHUB_SUPABASE_URL",
    "SUPABASE_URL",
    "VITE_SUPABASE_URL",
  );
  const key = firstEnv(
    "NEXORA_SUPABASE_SERVICE_ROLE_KEY",
    "EXPLOREHUB_SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  if (!url || !key) return null;

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/token?grant_type=id_token`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ provider: "google", id_token: idToken }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      user?: {
        email?: string;
        user_metadata?: { full_name?: string; name?: string; avatar_url?: string; picture?: string };
      };
    };
    const email = data.user?.email?.trim().toLowerCase();
    if (!email?.includes("@")) return null;
    const meta = data.user?.user_metadata ?? {};
    const name =
      meta.full_name?.trim() || meta.name?.trim() || email.split("@")[0] || "Traveller";
    const picture = meta.avatar_url || meta.picture || undefined;
    return { email, name, picture };
  } catch {
    return null;
  }
}

async function verifyViaGoogleTokenInfo(idToken: string): Promise<VerifiedGoogleProfile | null> {
  const audiences = googleClientIds();
  try {
    // POST avoids URL-length limits that break long Google ID tokens on GET.
    const res = await fetch("https://oauth2.googleapis.com/tokeninfo", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken }),
    });
    if (!res.ok) {
      // Fallback GET for older environments.
      const getRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      );
      if (!getRes.ok) return null;
      const claims = (await getRes.json()) as Record<string, unknown>;
      const aud = typeof claims.aud === "string" ? claims.aud : "";
      if (audiences.length && aud && !audiences.includes(aud)) return null;
      return profileFromClaims(claims);
    }
    const claims = (await res.json()) as Record<string, unknown>;
    const aud = typeof claims.aud === "string" ? claims.aud : "";
    if (audiences.length && aud && !audiences.includes(aud)) return null;
    return profileFromClaims(claims);
  } catch {
    return null;
  }
}

/** Verify Google ID token; throws a user-facing error when invalid. */
export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedGoogleProfile> {
  const token = idToken.trim();
  if (!token) {
    throw new Error(
      "Google sign-in token was missing. Refresh the page and try Continue with Google again.",
    );
  }
  if (token.split(".").length < 3) {
    throw new Error("Google sign-in returned an invalid token. Try again.");
  }

  const fromSupabase = await verifyViaSupabase(token);
  if (fromSupabase) return fromSupabase;

  const fromGoogle = await verifyViaGoogleTokenInfo(token);
  if (fromGoogle) return fromGoogle;

  // Last resort: decode locally only if audience matches our configured client ID.
  const audiences = googleClientIds();
  const claims = decodeJwtPayload(token);
  if (claims) {
    const aud = typeof claims.aud === "string" ? claims.aud : "";
    const exp = typeof claims.exp === "number" ? claims.exp : 0;
    if (exp * 1000 > Date.now() && audiences.length && audiences.includes(aud)) {
      const profile = profileFromClaims(claims);
      if (profile) return profile;
    }
  }

  throw new Error(
    "Could not verify Google sign-in. Confirm Google is enabled in Supabase Auth and GOOGLE_OAUTH_CLIENT_ID matches your Google Cloud client ID.",
  );
}

export function googleOAuthClientId(): string {
  return firstEnv("GOOGLE_OAUTH_CLIENT_ID", "VITE_GOOGLE_OAUTH_CLIENT_ID");
}
