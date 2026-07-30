/** Primary admin — auto-promoted on register / sign-in with this email. */
export const MAIN_ADMIN_EMAIL = "sheethappenswithjaa@gmail.com";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isMainAdminEmail(email: string) {
  return normalizeEmail(email) === MAIN_ADMIN_EMAIL;
}
