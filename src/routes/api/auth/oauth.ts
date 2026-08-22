import { createFileRoute } from "@tanstack/react-router";

import { prepareAuthRequest } from "@/lib/auth-route.server";
import { verifyGoogleIdToken } from "@/lib/google-id-token.server";
import { upsertOAuthAccount } from "@/lib/store.server";
import { createSessionToken, jsonWithSession } from "@/lib/session.server";

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Pull the Google ID token from body fields, nested `{ data }`, or Authorization. */
function extractGoogleIdToken(body: unknown, request: Request): string {
  const root = asRecord(body);
  const nested = asRecord(root.data);
  // Top-level wins over nested so a wrapper never hides idToken.
  const merged = { ...nested, ...root };

  const candidates = [merged.idToken, merged.id_token, merged.credential];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  const auth = request.headers.get("authorization")?.trim() ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }

  return "";
}

function extractOptionalString(body: unknown, key: string): string {
  const root = asRecord(body);
  const nested = asRecord(root.data);
  const value = root[key] ?? nested[key];
  return typeof value === "string" ? value.trim() : "";
}

/** Google OAuth upsert — verifies the Google ID token, persists the account, sets session. */
export const Route = createFileRoute("/api/auth/oauth")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ready = prepareAuthRequest();
        if (!ready.ok) return ready.response;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body." }, { status: 400 });
        }

        const idToken = extractGoogleIdToken(body, request);
        if (!idToken) {
          return Response.json(
            {
              error:
                "Google sign-in token was missing. Refresh the page and try Continue with Google again.",
            },
            { status: 400 },
          );
        }

        try {
          const verified = await verifyGoogleIdToken(idToken);
          const fallbackName = extractOptionalString(body, "name");
          const account = await upsertOAuthAccount({
            name: verified.name || fallbackName || "Traveller",
            email: verified.email,
            picture: verified.picture,
          });
          const token = await createSessionToken(account.email);
          return jsonWithSession(account, token, request);
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Sign-in failed." },
            { status: 503 },
          );
        }
      },
    },
  },
});
