import { createFileRoute } from "@tanstack/react-router";

import { prepareAuthRequest } from "@/lib/auth-route.server";
import { normalizeAccountName } from "@/lib/constants";
import { registerAccount } from "@/lib/store.server";
import { createSessionToken, jsonWithSession } from "@/lib/session.server";

/** Password sign-up — persists to Supabase and sets an HTTP-only session cookie. */
export const Route = createFileRoute("/api/auth/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const ready = prepareAuthRequest();
          if (!ready.ok) return ready.response;

          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
          }
          const data = (body as { data?: unknown })?.data ?? body;
          const parsed = data as { name?: unknown; email?: unknown; password?: unknown };
          const name = typeof parsed.name === "string" ? normalizeAccountName(parsed.name) : "";
          const email = typeof parsed.email === "string" ? parsed.email.trim() : "";
          const password = typeof parsed.password === "string" ? parsed.password : "";
          if (name.length < 2 || !email.includes("@") || password.length < 8) {
            return Response.json(
              { ok: false, error: "Enter a valid name, email, and password (8+ characters)." },
              { status: 400 },
            );
          }

          const result = await registerAccount({ name, email, password });
          if (!result.ok) {
            return Response.json(result, { status: 400 });
          }

          const token = await createSessionToken(result.account.email);
          return jsonWithSession({ ok: true, account: result.account }, token, request);
        } catch (error) {
          return Response.json(
            {
              ok: false,
              error: error instanceof Error ? error.message : "Registration failed.",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
