import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { getGoogleClientId } from "@/lib/google-auth.functions";
import { decodeIdToken, signInUser } from "@/hooks/use-auth";
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
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { clientId } = await getGoogleClientId();
        if (!clientId) {
          setError("Google sign-in is not configured yet.");
          return;
        }
        await loadGsi();
        if (cancelled || !ref.current) return;

        const width = Math.min(360, Math.max(280, ref.current.parentElement?.clientWidth ?? 320));

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response: { credential: string }) => {
            try {
              const profile = decodeIdToken(response.credential);
              if (!profile.email) {
                toast.error("Google did not return an email address.");
                return;
              }
              const account = await oauthSignIn({
                idToken: response.credential,
                name: profile.name ?? "Traveller",
                email: profile.email,
                picture: profile.picture,
              });
              signInUser({
                name: account.name,
                email: account.email,
                picture: account.picture,
                role: account.role,
              });
              toast.success(`Welcome, ${account.name}`);
              navigate({
                to: account.role === "admin" ? "/admin" : "/dashboard",
              });
              if (isMainAdminEmail(account.email)) {
                toast.message("Main admin access granted");
              }
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Could not complete Google sign-in.",
              );
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
    <div className="flex w-full justify-center">
      {!loaded ? <Skeleton className="h-11 w-full max-w-[360px] rounded-full" /> : null}
      <div ref={ref} className={loaded ? "w-full max-w-[360px]" : "hidden"} />
    </div>
  );
}
