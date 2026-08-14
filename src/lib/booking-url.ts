/** Public confirmation URL encoded in reservation QR codes. */
export function bookingConfirmationPath(reference: string) {
  return `/booking/${encodeURIComponent(reference.trim())}`;
}

export function bookingConfirmationUrl(reference: string) {
  const path = bookingConfirmationPath(reference);
  if (typeof window !== "undefined") return `${window.location.origin}${path}`;
  return path;
}
