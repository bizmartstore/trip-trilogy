import { createFileRoute } from "@tanstack/react-router";

import { prepareAuthRequest } from "@/lib/auth-route.server";
import { signInAccount } from "@/lib/store.server";
import { createSessionToken, jsonWithSession } from "@/lib/session.server";

/** Password sign-in — validates against Supabase and sets an HTTP-only session cookie. */
export const Route = createFileRoute("/api/auth/sign-in")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ready = prepareAuthRequest();
        if (!ready.ok) return ready.response;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
        }
        const data = (body as { data?: unknown })?.data ?? body;
        const parsed = data as { email?: unknown; password?: unknown };
        const email = typeof parsed.email === "string" ? parsed.email.trim() : "";
        const password = typeof parsed.password === "string" ? parsed.password : "";
        if (!email.includes("@") || password.length < 8) {
          return Response.json(
            { ok: false, error: "Enter a valid email and password." },
            { status: 400 },
          );
        }

        const result = await signInAccount({ email, password });
        if (!result.ok) {
          return Response.json(result, { status: 400 });
        }

        const token = await createSessionToken(result.account.email);
        return jsonWithSession({ ok: true, account: result.account }, token, request);
      },
    },
  },
});
