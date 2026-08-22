import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { getGoogleClientId } from "@/lib/google-auth.functions";
import { applyAuthUser, decodeIdToken } from "@/hooks/use-auth";
import { oauthSignIn } from "@/lib/api";
import { isMainAdminEmail } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";

declare global {
  interface Window {
    google?: any;
  }
}

function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-gsi]");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("gsi")));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.dataset.gsi = "true";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("gsi"));
    document.head.appendChild(s);
  });
}

export function GoogleSignInButton() {
  const ref = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { clientId } = await getGoogleClientId();
        if (!clientId) {
          setError(
            "Google sign-in needs GOOGLE_OAUTH_CLIENT_ID on the server (same Web client ID as in Supabase → Authentication → Google).",
          );
          return;
        }
        await loadGsi();
        if (cancelled || !ref.current || initialized.current) return;

        const width = Math.min(360, Math.max(280, ref.current.parentElement?.clientWidth ?? 320));

        window.google.accounts.id.initialize({
          client_id: clientId,
          auto_select: false,
          cancel_on_tap_outside: true,
          callback: async (response: { credential?: string }) => {
            const idToken = typeof response?.credential === "string" ? response.credential.trim() : "";
            if (!idToken || idToken.split(".").length < 3) {
              toast.error("Google did not return a sign-in token. Try again.");
              return;
            }
            setBusy(true);
            try {
              const profile = decodeIdToken(idToken);
              const account = await oauthSignIn({
                idToken,
                name: profile.name ?? "Traveller",
                email: profile.email,
                picture: profile.picture,
              });
              applyAuthUser({
                name: account.name,
                email: account.email,
                picture: account.picture,
                role: account.role,
              });
              void import("@/lib/push-auth").then(({ syncPushAfterAuth }) => {
                syncPushAfterAuth(account, {
                  isNewAccount: Boolean((account as { isNew?: boolean }).isNew),
                });
              });
              if (account.role === "admin") {
                toast.success(
                  isMainAdminEmail(account.email)
                    ? "Welcome, main admin"
                    : "Welcome, admin",
                );
                navigate({ to: "/admin" });
              } else {
                toast.success(`Welcome, ${account.name}`);
                navigate({ to: "/dashboard" });
              }
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Could not complete Google sign-in.",
              );
            } finally {
              setBusy(false);
            }
          },
        });

        window.google.accounts.id.renderButton(ref.current, {
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          width,
          logo_alignment: "center",
        });
        initialized.current = true;
        setLoaded(true);
      } catch {
        if (!cancelled) setError("Google sign-in could not load. Check your connection.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (error) {
    return <p className="text-center text-xs text-muted-foreground">{error}</p>;
  }

  return (
    <div className="flex w-full flex-col items-center gap-2">
      {!loaded ? <Skeleton className="h-11 w-full max-w-[360px] rounded-full" /> : null}
      <div
        ref={ref}
        className={loaded ? `w-full max-w-[360px] ${busy ? "pointer-events-none opacity-60" : ""}` : "hidden"}
      />
      {busy ? <p className="text-xs text-muted-foreground">Signing you in…</p> : null}
    </div>
  );
}
