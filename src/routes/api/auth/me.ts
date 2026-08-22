import { createFileRoute } from "@tanstack/react-router";

import { prepareAuthRequest } from "@/lib/auth-route.server";
import { getSessionUser } from "@/lib/session.server";

/** Return the signed-in user from the HTTP-only session cookie (backed by Supabase). */
export const Route = createFileRoute("/api/auth/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const ready = prepareAuthRequest();
          if (!ready.ok) return ready.response;

          const user = await getSessionUser(request);
          // 200 + null = guest (not an auth failure). Avoids console 401 spam from useAuth probes.
          return Response.json({ user: user ?? null });
        } catch (error) {
          return Response.json(
            {
              user: null,
              error: error instanceof Error ? error.message : "Session lookup failed.",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
