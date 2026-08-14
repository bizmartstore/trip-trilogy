import { createFileRoute } from "@tanstack/react-router";

import { prepareAuthRequest } from "@/lib/auth-route.server";
import { clearSessionCookieHeader, getSessionUser } from "@/lib/session.server";

/** Return the signed-in user from the HTTP-only session cookie (backed by Supabase). */
export const Route = createFileRoute("/api/auth/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ready = prepareAuthRequest();
        if (!ready.ok) return ready.response;

        const user = await getSessionUser(request);
        if (!user) {
          return Response.json({ user: null }, { status: 401 });
        }
        return Response.json({ user });
      },
    },
  },
});
