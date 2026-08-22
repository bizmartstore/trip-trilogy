import { createServerFn } from "@tanstack/react-start";

import { googleOAuthClientId } from "@/lib/google-id-token.server";

/**
 * Exposes the (public) Google OAuth client ID to the browser.
 * Use the same Web client ID configured under Supabase → Authentication → Google.
 */
export const getGoogleClientId = createServerFn({ method: "GET" }).handler(async () => {
  const { syncEnvFromGlobal } = await import("@/lib/worker-env");
  syncEnvFromGlobal();
  return { clientId: googleOAuthClientId() };
});
