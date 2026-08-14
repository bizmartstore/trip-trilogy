import { Link } from "@tanstack/react-router";
import { Facebook, Instagram, Mail, MapPin, Phone, Twitter } from "lucide-react";
import { NEXORA_LOGO_SRC } from "@/lib/brand";
import { toast } from "sonner";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchSettings } from "@/lib/api";

const columns = [
  {
    title: "Discover",
    links: [
      { label: "Tours & experiences", to: "/explore" as const },
      { label: "Stays", to: "/explore" as const },
      { label: "Restaurants", to: "/explore" as const },
      { label: "Trip planner", to: "/planner" as const },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Nexora", to: "/explore" as const },
      { label: "Create account", to: "/auth" as const },
      { label: "Careers", to: "/explore" as const },
      { label: "Press", to: "/explore" as const },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help centre", to: "/help-centre" as const },
      { label: "Cancellation policy", to: "/cancellation-policy" as const },
      { label: "Privacy policy", to: "/privacy-policy" as const },
      { label: "Terms of service", to: "/terms-of-service" as const },
    ],
  },
];

export function Footer() {
  const [email, setEmail] = useState("");
  const settings = useQuery({ queryKey: ["hub-settings"], queryFn: fetchSettings });
  const contact = settings.data;

  return (
    <footer className="mt-24 bg-deep text-deep-foreground">
      <div className="container-x py-16 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_2fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <img
                src={NEXORA_LOGO_SRC}
                alt="Nexora"
                className="size-9 rounded-2xl bg-background object-contain"
              />
              <span className="font-display text-xl font-semibold">Nexora</span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-deep-foreground/70">
              One marketplace for tours, stays and tables — built for travellers who want the
              whole trip planned in a single place.
            </p>

            <form
              className="mt-7 flex max-w-md gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
                  toast.error("Please enter a valid email address");
                  return;
                }
                toast.success("You're subscribed", {
                  description: "Weekly escapes land in your inbox every Thursday.",
                });
                setEmail("");
              }}
            >
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Email address"
                className="h-11 rounded-full border-deep-foreground/20 bg-deep-foreground/10 text-deep-foreground placeholder:text-deep-foreground/50"
              />
              <Button type="submit" variant="sand" className="h-11 shrink-0 rounded-full px-5">
                Subscribe
              </Button>
            </form>

            <div className="mt-7 space-y-2 text-sm text-deep-foreground/70">
              <p className="flex items-center gap-2">
                <MapPin className="size-4 shrink-0" /> {contact?.contactAddress ?? "Palawan, Philippines"}
              </p>
              <a className="flex items-center gap-2 hover:text-deep-foreground" href={`tel:${contact?.contactPhone ?? "+639990000000"}`}>
                <Phone className="size-4 shrink-0" /> {contact?.contactPhone ?? "+63 999 000 0000"}
              </a>
              <a className="flex items-center gap-2 hover:text-deep-foreground" href={`mailto:${contact?.contactEmail ?? "sheethappenswithjaa@gmail.com"}`}>
                <Mail className="size-4 shrink-0" /> {contact?.contactEmail ?? "sheethappenswithjaa@gmail.com"}
              </a>
            </div>
          </div>

          <div className="grid gap-10 sm:grid-cols-3">
            {columns.map((col) => (
              <div key={col.title}>
                <h3 className="font-display text-sm font-semibold uppercase tracking-widest text-sand">
                  {col.title}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        to={link.to}
                        className="text-sm text-deep-foreground/70 transition-colors hover:text-deep-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-5 border-t border-deep-foreground/15 pt-7 sm:flex-row">
          <p className="text-xs text-deep-foreground/60">
            © {new Date().getFullYear()} Nexora. All rights reserved.
          </p>
          <div className="flex items-center gap-2">
            {(
              [
                { Icon: Instagram, url: contact?.socialInstagram, label: "Instagram" },
                { Icon: Twitter, url: contact?.socialTwitter, label: "X (Twitter)" },
                { Icon: Facebook, url: contact?.socialFacebook, label: "Facebook" },
              ] as const
            )
              .filter((s) => s.url?.trim())
              .map(({ Icon, url, label }) => (
                <a
                  key={label}
                  href={url!.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="grid size-9 place-items-center rounded-full border border-deep-foreground/20 transition-colors hover:bg-deep-foreground/10"
                >
                  <Icon className="size-4" />
                </a>
              ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
