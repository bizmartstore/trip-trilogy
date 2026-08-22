import { Check } from "lucide-react";

import { packageTierMetaLabel } from "@/lib/booking-model";
import type { ListingPackage } from "@/lib/types";
import { cn, peso } from "@/lib/utils";

export function PackagePicker({
  packages,
  selectedId,
  onSelect,
}: {
  packages: ListingPackage[];
  selectedId?: string;
  onSelect: (pkg: ListingPackage) => void;
}) {
  if (!packages.length) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
        Packages are not configured for this listing yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {packages.map((pkg) => {
        const selected = pkg.id === selectedId;
        const meta = packageTierMetaLabel(pkg);
        return (
          <button
            key={pkg.id}
            type="button"
            onClick={() => onSelect(pkg)}
            className={cn(
              "w-full rounded-2xl border p-4 text-left transition-colors",
              selected
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border bg-card hover:border-primary/40",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display font-semibold">{pkg.name}</p>
                {meta ? (
                  <p className="mt-0.5 text-[11px] font-medium text-primary/80">{meta}</p>
                ) : null}
                {pkg.description ? (
                  <p className="mt-1 text-xs text-muted-foreground">{pkg.description}</p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold">{peso(pkg.price)}</p>
                {selected ? (
                  <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                    <Check className="size-3" /> Selected
                  </span>
                ) : (
                  <span className="mt-1 block text-[11px] text-muted-foreground">Select</span>
                )}
              </div>
            </div>
            {pkg.inclusions?.length ? (
              <ul className="mt-3 space-y-1">
                {pkg.inclusions.map((item) => (
                  <li key={item} className="flex gap-2 text-xs text-muted-foreground">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {pkg.exclusions?.length ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Not included: {pkg.exclusions.join(" · ")}
              </p>
            ) : null}
            {pkg.guestLimit ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Up to {pkg.guestLimit} guests
              </p>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
