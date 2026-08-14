import { createFileRoute } from "@tanstack/react-router";

import { prepareAuthRequest } from "@/lib/auth-route.server";
import { upsertOAuthAccount } from "@/lib/store.server";
import { createSessionToken, jsonWithSession } from "@/lib/session.server";

/** Google / OAuth upsert — persists to Supabase and sets an HTTP-only session cookie. */
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
        const data = (body as { data?: unknown })?.data ?? body;
        const parsed = data as { name?: unknown; email?: unknown; picture?: unknown };
        const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
        const email = typeof parsed.email === "string" ? parsed.email.trim() : "";
        const picture =
          typeof parsed.picture === "string" && parsed.picture ? parsed.picture : undefined;
        if (!name || !email.includes("@")) {
          return Response.json({ error: "Enter a valid name and email." }, { status: 400 });
        }

        try {
          const account = await upsertOAuthAccount({ name, email, picture });
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
