import { createFileRoute } from "@tanstack/react-router";

/**
 * Keep-alive endpoint. Point any free cron service (cron-job.org, UptimeRobot,
 * GitHub Actions) at this URL every ~5 minutes: it wakes the Cloudflare Worker
 * and performs a tiny Supabase read so the database never idles out.
 */
export const Route = createFileRoute("/api/public/keepalive")({
  server: {
    handlers: {
      GET: async () => {
        const { pingSupabase, supabaseConfigured } = await import(
          "@/lib/supabase-rest.server"
        );
        if (!supabaseConfigured()) {
          return Response.json({ ok: false, reason: "supabase-not-configured" });
        }
        try {
          const result = await pingSupabase();
          return Response.json({ ...result, at: new Date().toISOString() });
        } catch (error) {
          return Response.json(
            { ok: false, error: (error as Error).message },
            { status: 503 },
          );
        }
      },
    },
  },
});
