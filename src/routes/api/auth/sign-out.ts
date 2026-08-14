import { createFileRoute } from "@tanstack/react-router";

import { clearSessionCookieHeader } from "@/lib/session.server";

/** Clear the HTTP-only session cookie. */
export const Route = createFileRoute("/api/auth/sign-out")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        return Response.json(
          { ok: true },
          { headers: { "set-cookie": clearSessionCookieHeader(request) } },
        );
      },
    },
  },
});
