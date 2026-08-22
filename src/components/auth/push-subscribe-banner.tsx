import { useEffect, useState } from "react";
import { Bell, Loader2, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import type { PushRole } from "@/lib/onesignal";
import {
  acceptPushSubscribe,
  dismissPushSubscribe,
  initOneSignal,
  onPushBannerShowRequest,
  setPushBannerVisible,
  shouldShowPushBanner,
} from "@/lib/onesignal-web";

/** The only in-app push subscribe UI (tourists + admins). */
export function PushSubscribeBanner() {
  const { user, ready } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !user?.email) {
      setOpen(false);
      return;
    }

    let cancelled = false;
    const evaluate = async () => {
      await initOneSignal().catch(() => undefined);
      if (cancelled || !user.email) return;
      setOpen(shouldShowPushBanner(user.email));
    };

    const timer = window.setTimeout(() => void evaluate(), 500);
    const off = onPushBannerShowRequest(() => {
      window.setTimeout(() => void evaluate(), 150);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      off();
    };
  }, [ready, user?.email, user?.role]);

  useEffect(() => {
    setPushBannerVisible(open);
    return () => setPushBannerVisible(false);
  }, [open]);

  if (!user?.email) return null;

  const role: PushRole = user.role === "admin" ? "admin" : "tourist";

  const onSubscribe = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await acceptPushSubscribe(user.email, role);
      if (!result.subscriptionId) {
        throw new Error("Subscription id missing");
      }
      setOpen(false);
    } catch (err) {
      console.warn("[push] subscribe failed", err);
      setError(
        typeof Notification !== "undefined" && Notification.permission === "denied"
          ? "Notifications are blocked. Allow them in browser settings, then try again."
          : err instanceof Error
            ? err.message
            : "Could not enable push. Allow notifications and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const onDismiss = () => {
    dismissPushSubscribe(user.email);
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="push-subscribe"
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-0 bottom-0 z-[80] p-4 sm:bottom-6 sm:left-auto sm:right-6 sm:max-w-md sm:p-0"
          role="dialog"
          aria-labelledby="nexora-push-title"
          aria-describedby="nexora-push-desc"
        >
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-deep text-deep-foreground shadow-lift">
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                background:
                  "radial-gradient(ellipse at 20% 0%, color-mix(in oklab, var(--gold) 35%, transparent), transparent 55%)",
              }}
            />
            <button
              type="button"
              onClick={onDismiss}
              className="absolute right-3 top-3 rounded-full p-1.5 text-deep-foreground/70 transition hover:bg-white/10 hover:text-deep-foreground"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
            <div className="relative p-5 pr-10 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-gold/20 text-gold">
                  <Bell className="size-5" />
                </span>
                <div>
                  <h2 id="nexora-push-title" className="font-display text-lg font-semibold tracking-tight">
                    Enable booking alerts
                  </h2>
                  <p id="nexora-push-desc" className="mt-1.5 text-sm leading-relaxed text-deep-foreground/75">
                    {role === "admin"
                      ? "Tap Subscribe, then Allow. Wait until it finishes — OneSignal must show a Subscribed Web Push channel (External ID alone is not enough)."
                      : "Tap Subscribe, then Allow in your browser to get booking updates even when the app is closed."}
                  </p>
                  {error ? (
                    <p className="mt-2 text-xs text-red-300/90" role="alert">
                      {error}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-full text-deep-foreground/80 hover:bg-white/10 hover:text-deep-foreground"
                  disabled={busy}
                  onClick={onDismiss}
                >
                  Not now
                </Button>
                <Button
                  type="button"
                  variant="hero"
                  className="rounded-full"
                  disabled={busy}
                  onClick={() => void onSubscribe()}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "Subscribe"}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
