import { createFileRoute } from "@tanstack/react-router";

/**
 * Lightweight health check for post-deploy verification. It performs no
 * external calls (no Supabase ping, no push processing) so it can never fail —
 * it simply proves the Worker is up and serving. The old /api/public/keepalive
 * ping machinery was removed entirely; background maintenance now runs via the
 * native Cloudflare Cron Trigger (server/plugins/maintenance.ts).
 */
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({ ok: true, at: new Date().toISOString() }),
    },
  },
});
