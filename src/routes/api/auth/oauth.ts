import { createFileRoute } from "@tanstack/react-router";

import { upsertOAuthAccount } from "@/lib/store.server";
import { syncEnvFromGlobal } from "@/lib/worker-env";

/** Google / OAuth upsert via API route — keeps Worker secrets in scope. */
export const Route = createFileRoute("/api/auth/oauth")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        syncEnvFromGlobal();
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
          return Response.json(account);
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
