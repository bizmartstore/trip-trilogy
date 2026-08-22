import { Check } from "lucide-react";

import { packageTierMetaLabel } from "@/lib/booking-model";
import { Switch } from "@/components/ui/switch";
import type { ListingPackage } from "@/lib/types";
import { cn, peso } from "@/lib/utils";

/**
 * Assign reusable catalog packages to a Package listing (or Tour/Stay with per-package pricing).
 * Tier duration, billing, and inclusions are managed in the admin Packages tab.
 */
export function ListingPackagesEditor({
  catalog,
  selectedIds,
  onChange,
}: {
  catalog: ListingPackage[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const ordered = [...catalog].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const selected = new Set(selectedIds);

  const toggle = (id: string, on: boolean) => {
    if (on) onChange([...selectedIds, id]);
    else onChange(selectedIds.filter((pkgId) => pkgId !== id));
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border p-4 sm:col-span-2">
      <div>
        <p className="text-sm font-medium">Available package tiers</p>
        <p className="text-xs text-muted-foreground">
          Choose which Standard / Premium / Luxury (or custom) tiers customers can book. Edit
          duration, per-person or per-night pricing, and inclusions in the Packages tab.
        </p>
      </div>

      {!ordered.length ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          No packages in the catalog yet. Open the Packages tab to add Standard, Premium, or Luxury.
        </p>
      ) : (
        <div className="space-y-3">
          {ordered.map((pkg) => {
            const on = selected.has(pkg.id);
            return (
              <div
                key={pkg.id}
                className={cn(
                  "rounded-2xl border p-4 transition-colors",
                  on ? "border-primary/40 bg-primary/5" : "border-border bg-secondary/20",
                  pkg.active === false && "opacity-60",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {pkg.name} · {peso(pkg.price)}
                      {pkg.active === false ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          (inactive)
                        </span>
                      ) : null}
                    </p>
                    {packageTierMetaLabel(pkg) ? (
                      <p className="mt-0.5 text-[11px] font-medium text-primary/80">
                        {packageTierMetaLabel(pkg)}
                      </p>
                    ) : null}
                    {pkg.description ? (
                      <p className="mt-1 text-xs text-muted-foreground">{pkg.description}</p>
                    ) : null}
                    {pkg.inclusions?.length ? (
                      <ul className="mt-2 space-y-1">
                        {pkg.inclusions.slice(0, 3).map((item) => (
                          <li key={item} className="flex gap-2 text-[11px] text-muted-foreground">
                            <Check className="mt-0.5 size-3 shrink-0 text-success" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">{on ? "Assigned" : "Off"}</span>
                    <Switch checked={on} onCheckedChange={(v) => toggle(pkg.id, v)} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
