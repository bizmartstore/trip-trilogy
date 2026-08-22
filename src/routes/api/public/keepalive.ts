import { createFileRoute } from "@tanstack/react-router";

import { serviceRoleKeyStatus, syncEnvFromGlobal } from "@/lib/worker-env";

/**
 * Keep-alive endpoint. Point any free cron service (cron-job.org, UptimeRobot,
 * GitHub Actions) at this URL every ~5 minutes: it wakes the Cloudflare Worker
 * and performs a tiny Supabase read so the database never idles out.
 *
 * Always responds with HTTP 200 — individual stages report their own ok/error
 * fields so a transient failure never breaks the cron ping.
 */
export const Route = createFileRoute("/api/public/keepalive")({
  server: {
    handlers: {
      GET: async () => {
        syncEnvFromGlobal();
        const status = serviceRoleKeyStatus();
        const { supabaseConfigured } = await import("@/lib/supabase-rest.server");

        if (!supabaseConfigured()) {
          return Response.json({
            ok: false,
            reason: "supabase-not-configured",
            secrets: status,
            at: new Date().toISOString(),
          });
        }

        let ping: Record<string, unknown> = { ok: false, error: "not-run" };
        try {
          const { pingSupabase } = await import("@/lib/supabase-rest.server");
          ping = await pingSupabase();
        } catch (error) {
          ping = { ok: false, error: error instanceof Error ? error.message : "ping-failed" };
        }

        let newBookings: Record<string, unknown> = { sent: 0, pending: 0 };
        try {
          const { processNewBookingAdminPushes } = await import("@/lib/store.server");
          newBookings = await processNewBookingAdminPushes();
        } catch (error) {
          newBookings = {
            sent: 0,
            pending: 0,
            error: error instanceof Error ? error.message : "new-booking-push-failed",
          };
        }

        let reminders: Record<string, unknown> = { sent: 0 };
        try {
          const { processBookingDayBeforeReminders } = await import("@/lib/store.server");
          reminders = await processBookingDayBeforeReminders();
        } catch (error) {
          reminders = {
            sent: 0,
            error: error instanceof Error ? error.message : "reminder-failed",
          };
        }

        let onesignal: Record<string, unknown> = {};
        try {
          const { onesignalKeyStatus } = await import("@/lib/onesignal.server");
          onesignal = onesignalKeyStatus();
        } catch {
          onesignal = { error: "status-unavailable" };
        }

        // 200 even if stages failed — diagnostics travel in the JSON body so
        // uptime monitors and the GitHub Actions keepalive stay green.
        return Response.json({
          ...ping,
          newBookings,
          reminders,
          onesignal,
          secrets: status,
          at: new Date().toISOString(),
        });
      },
    },
  },
});
