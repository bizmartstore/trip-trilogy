import { createFileRoute } from "@tanstack/react-router";

import { signInAccount } from "@/lib/store.server";
import { syncEnvFromGlobal } from "@/lib/worker-env";

/** Password sign-in via API route — keeps Worker secrets in scope. */
export const Route = createFileRoute("/api/auth/sign-in")({
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
        return Response.json(result, { status: result.ok ? 200 : 400 });
      },
    },
  },
});
