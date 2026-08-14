import { createServerFn } from "@tanstack/react-start";

/**
 * Exposes the (public) Google OAuth client ID to the browser.
 * The value is stored as a project secret and read at call time.
 */
export const getGoogleClientId = createServerFn({ method: "GET" }).handler(async () => {
  const { firstEnv, syncEnvFromGlobal } = await import("@/lib/worker-env");
  syncEnvFromGlobal();
  return { clientId: firstEnv("GOOGLE_OAUTH_CLIENT_ID") };
});
