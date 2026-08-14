import { createFileRoute } from "@tanstack/react-router";

import { getBookingByReference } from "@/lib/store.server";
import { syncEnvFromGlobal } from "@/lib/worker-env";

export const Route = createFileRoute("/api/public/booking/$reference")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        syncEnvFromGlobal();
        const booking = await getBookingByReference(params.reference);
        if (!booking) {
          return Response.json({ ok: false, error: "not-found" }, { status: 404 });
        }
        return Response.json({ ok: true, booking });
      },
    },
  },
});
