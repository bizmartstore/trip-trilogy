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

async function fetchSession(): Promise<AuthUser | null> {
  try {
    const res = await fetch("/api/auth/me", {
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    if (res.ok) {
      const data = (await res.json()) as { user?: AuthUser | null };
      return data.user ?? null;
    }
    if (res.status === 401) return cachedUser;
    return cachedUser;
  } catch {
    return cachedUser;
  }
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
    if (session) cachedUser = session;
    setUser(session ?? cachedUser);
    setReady(true);
    return session ?? cachedUser;
  }, []);

  useEffect(() => {
    refresh();
    const sync = () => {
      setUser(cachedUser);
      refresh();
    };
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, [refresh]);

  const signOut = useCallback(async () => {
    cachedUser = null;
    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // Non-fatal when the sign-out route is unavailable.
    }
    setUser(null);
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
  const [, payload] = token.split(".");
  const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(decodeURIComponent(escape(json)));
}
