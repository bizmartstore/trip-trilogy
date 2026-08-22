import { createFileRoute } from "@tanstack/react-router";

import { prepareAuthRequest } from "@/lib/auth-route.server";
import { normalizeAccountName } from "@/lib/constants";
import { getSessionUser } from "@/lib/session.server";
import { updateAccountProfile } from "@/lib/store.server";

/** Update the signed-in user's display name (session cookie required). */
export const Route = createFileRoute("/api/auth/profile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ready = prepareAuthRequest();
        if (!ready.ok) return ready.response;

        const sessionUser = await getSessionUser(request);
        if (!sessionUser) {
          return Response.json({ error: "Sign in to update your profile." }, { status: 401 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body." }, { status: 400 });
        }
        const data = (body as { data?: unknown })?.data ?? body;
        const parsed = data as { name?: unknown };
        const name = typeof parsed.name === "string" ? normalizeAccountName(parsed.name) : "";
        if (name.length < 2) {
          return Response.json(
            { error: "Enter your full name (at least 2 characters)." },
            { status: 400 },
          );
        }

        try {
          const account = await updateAccountProfile({
            email: sessionUser.email,
            name,
          });
          return Response.json(account);
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Could not update profile." },
            { status: 503 },
          );
        }
      },
    },
  },
});
