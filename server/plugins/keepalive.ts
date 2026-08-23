import type { NitroApp } from "nitro/types";

/**
 * Native Cloudflare Cron Trigger keepalive.
 *
 * A Cron Trigger in wrangler.toml fires a `scheduled` event every 10 minutes,
 * which Nitro routes to the `cloudflare:scheduled` hook (see the generated
 * `_module-handler.mjs`). This plugin does the same work as the
 * `/api/public/keepalive` endpoint — a tiny Supabase read plus processing of
 * any pending admin pushes and day-before/day-of booking reminders — entirely
 * inside Cloudflare, with no dependency on an external cron service (e.g.
 * GitHub Actions) or its network egress. Every stage is self-contained in a
 * try/catch so a single hiccup never aborts the batch.
 */
export default function keepaliveScheduled(nitroApp: NitroApp) {
  nitroApp.hooks?.hook("cloudflare:scheduled", async () => {
    const { syncEnvFromGlobal } = await import("@/lib/worker-env");
    syncEnvFromGlobal();

    try {
      const { pingSupabase } = await import("@/lib/supabase-rest.server");
      await pingSupabase();
    } catch {
      // Non-fatal — keep the rest of the batch running.
    }

    try {
      const { processNewBookingAdminPushes, processBookingDayBeforeReminders } =
        await import("@/lib/store.server");
      await processNewBookingAdminPushes();
      await processBookingDayBeforeReminders();
    } catch {
      // Non-fatal — a later scheduled run will retry.
    }
  });
}
