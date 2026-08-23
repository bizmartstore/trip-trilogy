import { Check, Users, X } from "lucide-react";

import {
  discountedUnitPrice,
  packageTierMetaLabel,
} from "@/lib/booking-model";
import type { ListingPackage } from "@/lib/types";
import { peso } from "@/lib/utils";

/**
 * Read-only overview of a listing's package tiers, shown in the listing
 * Details tab so travellers can compare options before reserving.
 * Responsive: single column on mobile, two columns on small screens and up.
 */
export function PackageOverview({
  packages,
  discountPct,
}: {
  packages: ListingPackage[];
  discountPct?: number;
}) {
  if (!packages.length) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {packages.map((pkg) => {
        const price = discountedUnitPrice(pkg.price, discountPct);
        const hasDiscount = !!discountPct && discountPct > 0 && price !== pkg.price;
        const meta = packageTierMetaLabel(pkg);
        return (
          <div
            key={pkg.id}
            className="flex flex-col rounded-2xl border border-border bg-card p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display font-semibold">{pkg.name}</p>
                {meta ? (
                  <p className="mt-0.5 text-[11px] font-medium text-primary/80">{meta}</p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                {hasDiscount ? (
                  <p className="text-xs text-muted-foreground line-through">
                    {peso(pkg.price)}
                  </p>
                ) : null}
                <p className="font-display font-semibold text-primary">{peso(price)}</p>
              </div>
            </div>

            {pkg.description ? (
              <p className="mt-2 text-sm text-muted-foreground">{pkg.description}</p>
            ) : null}

            {pkg.inclusions?.length ? (
              <ul className="mt-4 space-y-1.5">
                {pkg.inclusions.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {pkg.exclusions?.length ? (
              <ul className="mt-3 space-y-1.5">
                {pkg.exclusions.map((item) => (
                  <li
                    key={item}
                    className="flex gap-2 text-xs text-muted-foreground"
                  >
                    <X className="mt-0.5 size-3.5 shrink-0 opacity-70" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {pkg.guestLimit ? (
              <p className="mt-auto flex items-center gap-1.5 pt-4 text-xs text-muted-foreground">
                <Users className="size-3.5 shrink-0" /> Up to {pkg.guestLimit} guests
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
