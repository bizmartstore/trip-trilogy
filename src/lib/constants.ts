/** Primary admin — auto-promoted on register / sign-in with this email. */
export const MAIN_ADMIN_EMAIL = "sheethappenswithjaa@gmail.com";

/** Required to wipe all revenue/booking records (main admin only). */
export const REVENUE_RESET_CODE = "080108";

/** PayMaya payment gateway used to settle approved reservations. */
export const PAYMAYA_PAYMENT_LINK = "https://paymaya.me/MICAZTOURISTINN";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Account full names are stored in capital letters only. */
export function normalizeAccountName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleUpperCase("en-US");
}

export function isMainAdminEmail(email: string) {
  return normalizeEmail(email) === MAIN_ADMIN_EMAIL;
}
