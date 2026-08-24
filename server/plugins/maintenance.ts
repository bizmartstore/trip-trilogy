import type { NitroApp } from "nitro/types";

/**
 * Native Cloudflare Cron Trigger maintenance job.
 *
 * A Cron Trigger in wrangler.toml fires a `scheduled` event every 10 minutes,
 * which Nitro routes to the `cloudflare:scheduled` hook. This replaces the old
 * external "keep-alive ping" setup (GitHub Actions pinging an HTTP endpoint and
 * emailing on every transient failure). There is no external ping anymore:
 * Cloudflare itself wakes the Worker, which drains pending admin pushes and
 * day-before/day-of booking reminders directly against Supabase.
 *
 * Every stage is wrapped in try/catch so a single hiccup can never fail the
 * scheduled run — a later tick simply retries.
 */
export default function maintenanceScheduled(nitroApp: NitroApp) {
  nitroApp.hooks?.hook("cloudflare:scheduled", async () => {
    const { syncEnvFromGlobal } = await import("@/lib/worker-env");
    syncEnvFromGlobal();

    try {
      const { processNewBookingAdminPushes } = await import("@/lib/store.server");
      await processNewBookingAdminPushes();
    } catch (error) {
      console.warn("[maintenance] new-booking push batch failed; will retry next tick", error);
    }

    try {
      const { processBookingDayBeforeReminders } = await import("@/lib/store.server");
      await processBookingDayBeforeReminders();
    } catch (error) {
      console.warn("[maintenance] reminder batch failed; will retry next tick", error);
    }
  });
}
