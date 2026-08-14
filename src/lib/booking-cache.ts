import type { Booking } from "@/lib/types";

const PREFIX = "nexora:booking:";

export function cacheBookingConfirmation(booking: Booking) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`${PREFIX}${booking.reference}`, JSON.stringify(booking));
  } catch {
    // Storage unavailable — non-fatal.
  }
}

export function readCachedBookingConfirmation(reference: string): Booking | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${reference.trim()}`);
    if (!raw) return null;
    return JSON.parse(raw) as Booking;
  } catch {
    return null;
  }
}
