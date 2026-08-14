import { createFileRoute } from "@tanstack/react-router";

import { serviceRoleKeyStatus, syncEnvFromGlobal } from "@/lib/worker-env";

/**
 * Keep-alive endpoint. Point any free cron service (cron-job.org, UptimeRobot,
 * GitHub Actions) at this URL every ~5 minutes: it wakes the Cloudflare Worker
 * and performs a tiny Supabase read so the database never idles out.
 */
export const Route = createFileRoute("/api/public/keepalive")({
  server: {
    handlers: {
      GET: async () => {
        syncEnvFromGlobal();
        const status = serviceRoleKeyStatus();
        const { pingSupabase, supabaseConfigured } = await import(
          "@/lib/supabase-rest.server"
        );
        if (!supabaseConfigured()) {
          return Response.json({
            ok: false,
            reason: "supabase-not-configured",
            secrets: status,
          });
        }
        try {
          const result = await pingSupabase();
          return Response.json({
            ...result,
            secrets: status,
            at: new Date().toISOString(),
          });
        } catch (error) {
          return Response.json(
            { ok: false, error: (error as Error).message, secrets: status },
            { status: 503 },
          );
        }
      },
    },
  },
});
