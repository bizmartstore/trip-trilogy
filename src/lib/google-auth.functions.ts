import { createServerFn } from "@tanstack/react-start";

/**
 * Exposes the (public) Google OAuth client ID to the browser.
 * The value is stored as a project secret and read at call time.
 */
export const getGoogleClientId = createServerFn({ method: "GET" }).handler(async () => {
  return { clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "" };
});
