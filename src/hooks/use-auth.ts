import { useCallback, useEffect, useState } from "react";

export interface AuthUser {
  name: string;
  email: string;
  picture?: string;
  role: "tourist" | "admin";
}

const KEY = "explorehub.user";
const EVENT = "explorehub-auth";

function read(): AuthUser | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function signInUser(user: AuthUser) {
  localStorage.setItem(KEY, JSON.stringify(user));
  window.dispatchEvent(new Event(EVENT));
}

export function signOutUser() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENT));
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(read());
    setReady(true);
    const sync = () => setUser(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const signOut = useCallback(() => signOutUser(), []);

  return { user, ready, signOut, isAdmin: user?.role === "admin" };
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
