import { createFileRoute } from "@tanstack/react-router";

import { registerAccount } from "@/lib/store.server";
import { syncEnvFromGlobal } from "@/lib/worker-env";

/**
 * Password sign-up via a plain API route (same path style as keepalive).
 * Prefer this over createServerFn so Worker secrets are always in scope.
 */
export const Route = createFileRoute("/api/auth/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        syncEnvFromGlobal();
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
        }
        const data = (body as { data?: unknown })?.data ?? body;
        const parsed = data as { name?: unknown; email?: unknown; password?: unknown };
        const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
        const email = typeof parsed.email === "string" ? parsed.email.trim() : "";
        const password = typeof parsed.password === "string" ? parsed.password : "";
        if (name.length < 2 || !email.includes("@") || password.length < 8) {
          return Response.json(
            { ok: false, error: "Enter a valid name, email, and password (8+ characters)." },
            { status: 400 },
          );
        }
        const result = await registerAccount({ name, email, password });
        return Response.json(result, { status: result.ok ? 200 : 400 });
      },
    },
  },
});
