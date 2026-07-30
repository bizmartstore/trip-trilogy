import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { getGoogleClientId } from "@/lib/google-auth.functions";
import { decodeIdToken, signInUser } from "@/hooks/use-auth";
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

export function GoogleSignInButton({ role = "tourist" }: { role?: "tourist" | "owner" }) {
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

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response: { credential: string }) => {
            try {
              const profile = decodeIdToken(response.credential);
              signInUser({
                name: profile.name ?? "Traveller",
                email: profile.email ?? "",
                picture: profile.picture,
                role,
              });
              toast.success(`Welcome, ${profile.name ?? "traveller"}`);
              navigate({ to: "/dashboard" });
            } catch {
              toast.error("Could not read your Google profile.");
            }
          },
        });

        window.google.accounts.id.renderButton(ref.current, {
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          width: 360,
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
  }, [navigate, role]);

  if (error) {
    return <p className="text-center text-xs text-muted-foreground">{error}</p>;
  }

  return (
    <div className="flex justify-center">
      {!loaded ? <Skeleton className="h-11 w-full rounded-full" /> : null}
      <div ref={ref} className={loaded ? "" : "hidden"} />
    </div>
  );
}
