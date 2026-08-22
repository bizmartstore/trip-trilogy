import { Download, Share, Smartphone, X } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { NEXORA_LOGO_SRC } from "@/lib/brand";
import { onPushBannerVisibility } from "@/lib/onesignal-web";
import { cn } from "@/lib/utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches
  );
}

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallAppBanner() {
  const [installed, setInstalled] = useState(true);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [hint, setHint] = useState<"ios" | "browser" | null>(null);
  const [busy, setBusy] = useState(false);
  const [pushBannerOpen, setPushBannerOpen] = useState(false);

  useEffect(() => {
    const syncInstalled = () => setInstalled(isStandaloneDisplay());
    syncInstalled();

    const media = window.matchMedia("(display-mode: standalone)");
    const onMedia = () => syncInstalled();
    media.addEventListener("change", onMedia);

    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      setHint(null);
    };
    window.addEventListener("appinstalled", onInstalled);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    const offPush = onPushBannerVisibility(setPushBannerOpen);

    return () => {
      media.removeEventListener("change", onMedia);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      offPush();
    };
  }, []);

  const install = useCallback(async () => {
    if (promptEvent) {
      setBusy(true);
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice.outcome === "accepted") {
          setInstalled(true);
          setPromptEvent(null);
          setHint(null);
        }
      } finally {
        setBusy(false);
      }
      return;
    }
    setHint(isIosDevice() ? "ios" : "browser");
  }, [promptEvent]);

  // One prompt at a time — hide install while push subscribe is open.
  if (installed || pushBannerOpen) return null;

  return (
    <>
      <div className="h-28" aria-hidden />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
        <motion.div
          initial={{ y: 28, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className={cn(
            "pointer-events-auto mx-auto max-w-xl overflow-hidden rounded-3xl border border-white/15 shadow-lift",
            "bg-[image:var(--gradient-primary)] text-primary-foreground",
          )}
        >
          <div className="relative px-4 py-4 sm:px-5">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{ backgroundImage: "var(--gradient-sheen)" }}
            />
            <div className="relative flex items-center gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
                <img src={NEXORA_LOGO_SRC} alt="" className="size-8 rounded-lg object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-gold">
                  <Smartphone className="size-3.5" />
                  Nexora app
                </p>
                <p className="mt-0.5 truncate font-display text-lg font-semibold leading-tight">
                  Install Nexora on your phone
                </p>
                <p className="mt-0.5 text-xs text-primary-foreground/80">
                  Book tours, stays and dining from your home screen.
                </p>
              </div>
              <Button
                variant="gold"
                size="sm"
                className="shrink-0 rounded-full"
                disabled={busy}
                onClick={() => void install()}
              >
                <Download className="size-4" />
                {busy ? "Installing…" : "Install"}
              </Button>
            </div>

            {hint ? (
              <p className="relative mt-3 flex items-start gap-2 rounded-2xl bg-black/20 px-3 py-2 text-xs leading-relaxed text-primary-foreground/90">
                <Share className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {hint === "ios" ? (
                    <>
                      On iPhone, tap the <strong>Share</strong> button, then{" "}
                      <strong>Add to Home Screen</strong>. This banner hides once Nexora is
                      installed.
                    </>
                  ) : (
                    <>
                      Open your browser menu and choose <strong>Install app</strong> or{" "}
                      <strong>Add to Home Screen</strong>. This banner hides once Nexora is
                      installed.
                    </>
                  )}
                </span>
                <button
                  type="button"
                  className="ml-auto shrink-0 rounded-full p-1 text-primary-foreground/70 hover:bg-white/10 hover:text-primary-foreground"
                  onClick={() => setHint(null)}
                  aria-label="Hide install tip"
                >
                  <X className="size-3.5" />
                </button>
              </p>
            ) : null}
          </div>
        </motion.div>
      </div>
    </>
  );
}
