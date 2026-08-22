import { useCallback, useEffect, useState } from "react";

export interface AuthUser {
  name: string;
  email: string;
  picture?: string;
  role: "tourist" | "admin";
}

const EVENT = "nexora-auth";

/** In-memory session mirror — updated after sign-in and from /api/auth/me when available. */
let cachedUser: AuthUser | null = null;

/** Single-flight so Navbar + PushAuthBridge + pages don't spam /api/auth/me. */
let inflightSession: Promise<AuthUser | null> | null = null;

async function fetchSession(): Promise<AuthUser | null> {
  if (inflightSession) return inflightSession;
  inflightSession = (async () => {
    try {
      const res = await fetch("/api/auth/me", {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        // Transient server error — keep the in-memory session if we have one.
        return cachedUser;
      }
      const data = (await res.json()) as { user?: AuthUser | null };
      return data.user ?? null;
    } catch {
      return cachedUser;
    } finally {
      inflightSession = null;
    }
  })();
  return inflightSession;
}

/** Set the signed-in user immediately after a successful auth API response. */
export function applyAuthUser(user: AuthUser) {
  cachedUser = user;
  window.dispatchEvent(new Event(EVENT));
}

/** Tell all useAuth hooks to reload the session from the server. */
export function notifyAuthChanged() {
  window.dispatchEvent(new Event(EVENT));
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(cachedUser);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const session = await fetchSession();
    cachedUser = session;
    setUser(session);
    setReady(true);
    return session;
  }, []);

  useEffect(() => {
    void refresh();
    // Auth events only sync the in-memory user — do not re-hit /api/auth/me
    // immediately after applyAuthUser (cookie race / console spam).
    const sync = () => setUser(cachedUser);
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, [refresh]);

  const signOut = useCallback(async () => {
    cachedUser = null;
    setUser(null);
    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // Non-fatal when the sign-out route is unavailable.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { user, ready, signOut, refresh, isAdmin: user?.role === "admin" };
}

/** Decode the payload of a Google ID token (JWT) without verifying it. */
export function decodeIdToken(token: string): {
  name?: string;
  email?: string;
  picture?: string;
} {
  try {
    const [, payload] = token.split(".");
    if (!payload) return {};
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const json = atob(padded + pad);
    const claims = JSON.parse(json) as {
      name?: string;
      email?: string;
      picture?: string;
    };
    return claims;
  } catch {
    return {};
  }
}
