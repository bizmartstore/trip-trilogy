import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createPackage,
  deletePackage,
  fetchPackages,
  reorderPackages,
  updatePackage,
} from "@/lib/api";
import { formatDurationLabel, PACKAGE_BILLING_LABELS, packageTierMetaLabel } from "@/lib/booking-model";
import { filesToImageText } from "@/lib/image-text";
import type { ListingPackage, PackageBillingType, PackageInput } from "@/lib/types";
import { cn, peso } from "@/lib/utils";

const emptyForm = (): PackageInput => ({
  name: "",
  description: "",
  price: 0,
  inclusions: [],
  exclusions: [],
  active: true,
  durationDays: 2,
  durationNights: 1,
  pricingType: "per_person",
});

export function PackagesPanel({ actorEmail }: { actorEmail: string }) {
  const qc = useQueryClient();
  const packages = useQuery({ queryKey: ["packages"], queryFn: fetchPackages });
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PackageInput>(emptyForm());
  const [inclusionsText, setInclusionsText] = useState("");
  const [exclusionsText, setExclusionsText] = useState("");
  const [uploading, setUploading] = useState(false);

  const ordered = [...(packages.data ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setInclusionsText("");
    setExclusionsText("");
    setOpen(true);
  };

  const openEdit = (pkg: ListingPackage) => {
    setEditingId(pkg.id);
    setForm({
      name: pkg.name,
      description: pkg.description,
      price: pkg.price,
      inclusions: pkg.inclusions ?? [],
      exclusions: pkg.exclusions ?? [],
      guestLimit: pkg.guestLimit,
      image: pkg.image,
      active: pkg.active !== false,
      position: pkg.position,
      durationDays: pkg.durationDays ?? 2,
      durationNights: pkg.durationNights ?? 1,
      pricingType: pkg.pricingType === "per_night" ? "per_night" : "per_person",
    });
    setInclusionsText((pkg.inclusions ?? []).join("\n"));
    setExclusionsText((pkg.exclusions ?? []).join("\n"));
    setOpen(true);
  };

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["packages"] });
    void qc.invalidateQueries({ queryKey: ["admin-listings"] });
    void qc.invalidateQueries({ queryKey: ["featured"] });
    void qc.invalidateQueries({ queryKey: ["search"] });
    void qc.invalidateQueries({ queryKey: ["trending"] });
    void qc.invalidateQueries({ queryKey: ["recent"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const days = Math.max(1, Math.round(Number(form.durationDays) || 1));
      const nights =
        form.durationNights == null
          ? Math.max(0, days - 1)
          : Math.max(0, Math.round(Number(form.durationNights) || 0));
      const payload: PackageInput = {
        ...form,
        name: form.name.trim(),
        description: form.description.trim(),
        price: Math.max(0, Math.round(Number(form.price) || 0)),
        inclusions: inclusionsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        exclusions: exclusionsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        guestLimit:
          form.guestLimit == null || Number(form.guestLimit) <= 0
            ? null
            : Math.max(1, Number(form.guestLimit)),
        active: form.active !== false,
        durationDays: days,
        durationNights: nights,
        pricingType: form.pricingType === "per_night" ? "per_night" : "per_person",
      };
      if (editingId) return updatePackage(actorEmail, editingId, payload);
      return createPackage(actorEmail, payload);
    },
    onSuccess: () => {
      toast.success(editingId ? "Package updated" : "Package added");
      setOpen(false);
      invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save package"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deletePackage(actorEmail, id),
    onSuccess: () => {
      toast.success("Package removed");
      invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not delete package"),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      updatePackage(actorEmail, id, { active }),
    onSuccess: () => invalidate(),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update status"),
  });

  const move = useMutation({
    mutationFn: async ({ id, dir }: { id: string; dir: -1 | 1 }) => {
      const idx = ordered.findIndex((p) => p.id === id);
      const swap = ordered[idx + dir];
      if (!swap) return ordered;
      const next = ordered.map((p) => p.id);
      [next[idx], next[idx + dir]] = [next[idx + dir]!, next[idx]!];
      return reorderPackages(actorEmail, next);
    },
    onSuccess: () => invalidate(),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not reorder packages"),
  });

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const [image] = await filesToImageText(files);
      if (image) setForm((f) => ({ ...f, image }));
    } catch {
      toast.error("Could not read that image");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Package tiers</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Configure Standard, Premium, Luxury (and custom tiers) with duration, per-person or
            per-night pricing, and inclusions. Assign them to Package listings (or Tours/Stays with
            Per Package pricing) so customers can book them from Explore.
          </p>
        </div>
        <Button type="button" className="rounded-full" onClick={openCreate}>
          <Plus className="size-4" /> Add package tier
        </Button>
      </div>

      {packages.isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64 rounded-3xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ordered.map((pkg, index) => (
            <article
              key={pkg.id}
              className={cn(
                "flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-soft",
                pkg.active === false && "opacity-75",
              )}
            >
              {pkg.image ? (
                <img src={pkg.image} alt="" className="h-36 w-full object-cover" />
              ) : (
                <div className="flex h-28 items-end bg-gradient-to-br from-primary/15 via-secondary to-accent/20 px-5 pb-4">
                  <p className="font-display text-2xl font-semibold">{pkg.name}</p>
                </div>
              )}
              <div className="flex flex-1 flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    {pkg.image ? (
                      <p className="font-display text-lg font-semibold">{pkg.name}</p>
                    ) : null}
                    <p className="text-lg font-semibold text-primary">{peso(pkg.price)}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {packageTierMetaLabel(pkg) ||
                        PACKAGE_BILLING_LABELS[
                          pkg.pricingType === "per_night" ? "per_night" : "per_person"
                        ]}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium",
                      pkg.active !== false
                        ? "bg-success/15 text-success"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {pkg.active !== false ? "Active" : "Inactive"}
                  </span>
                </div>
                {pkg.description ? (
                  <p className="line-clamp-3 text-sm text-muted-foreground">{pkg.description}</p>
                ) : null}
                {pkg.inclusions?.length ? (
                  <ul className="space-y-1">
                    {pkg.inclusions.slice(0, 4).map((item) => (
                      <li key={item} className="flex gap-2 text-xs text-muted-foreground">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                        <span>{item}</span>
                      </li>
                    ))}
                    {pkg.inclusions.length > 4 ? (
                      <li className="text-[11px] text-muted-foreground">
                        +{pkg.inclusions.length - 4} more inclusions
                      </li>
                    ) : null}
                  </ul>
                ) : null}
                {pkg.exclusions?.length ? (
                  <p className="text-[11px] text-muted-foreground">
                    Not included: {pkg.exclusions.slice(0, 2).join(" · ")}
                    {pkg.exclusions.length > 2 ? "…" : ""}
                  </p>
                ) : null}
                <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="rounded-full"
                    disabled={index === 0 || move.isPending}
                    onClick={() => move.mutate({ id: pkg.id, dir: -1 })}
                  >
                    Up
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="rounded-full"
                    disabled={index === ordered.length - 1 || move.isPending}
                    onClick={() => move.mutate({ id: pkg.id, dir: 1 })}
                  >
                    Down
                  </Button>
                  <div className="flex items-center gap-2 text-xs">
                    <Switch
                      checked={pkg.active !== false}
                      onCheckedChange={(active) => toggleActive.mutate({ id: pkg.id, active })}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="ml-auto rounded-full"
                    onClick={() => openEdit(pkg)}
                  >
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="rounded-full text-destructive"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (confirm(`Delete “${pkg.name}”? Listings using it will drop this tier.`)) {
                        remove.mutate(pkg.id);
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit package tier" : "Add package tier"}</DialogTitle>
            <DialogDescription>
              Set days/nights, billing (per person or per night), price, and inclusions. Customers
              who pick this tier get an end date that matches the duration on the calendar.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Tier name</Label>
              <Input
                className="h-11 rounded-xl"
                placeholder="e.g. Standard, Premium, Luxury"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Price (PHP)</Label>
              <Input
                type="number"
                className="h-11 rounded-xl"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Billing</Label>
              <Select
                value={form.pricingType ?? "per_person"}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, pricingType: v as PackageBillingType }))
                }
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_person">Per Person</SelectItem>
                  <SelectItem value="per_night">Per Night</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Days</Label>
                <Input
                  type="number"
                  min={1}
                  className="h-11 rounded-xl"
                  value={form.durationDays ?? 2}
                  onChange={(e) => {
                    const days = Math.max(1, Number(e.target.value) || 1);
                    setForm((f) => ({
                      ...f,
                      durationDays: days,
                      durationNights: Math.max(0, days - 1),
                    }));
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nights</Label>
                <Input
                  type="number"
                  min={0}
                  className="h-11 rounded-xl"
                  value={form.durationNights ?? 1}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      durationNights: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Calendar occupancy:{" "}
              {formatDurationLabel(
                Math.max(1, form.durationDays ?? 2),
                form.durationNights ?? Math.max(0, (form.durationDays ?? 2) - 1),
              )}
              . Start date → end date will span this length.
            </p>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                className="min-h-20 rounded-xl"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Inclusions (one per line)</Label>
              <Textarea
                className="min-h-28 rounded-xl"
                value={inclusionsText}
                onChange={(e) => setInclusionsText(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Exclusions (one per line)</Label>
              <Textarea
                className="min-h-20 rounded-xl"
                value={exclusionsText}
                onChange={(e) => setExclusionsText(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Guest limit (optional)</Label>
              <Input
                type="number"
                className="h-11 rounded-xl"
                placeholder="No limit"
                value={form.guestLimit ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    guestLimit:
                      e.target.value === "" ? null : Math.max(1, Number(e.target.value) || 1),
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Package image (optional)</Label>
              <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border text-xs text-muted-foreground">
                {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                {form.image ? "Replace image" : "Upload image"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void onUpload(e.target.files)}
                />
              </label>
              {form.image ? (
                <img src={form.image} alt="" className="mt-1 h-16 w-24 rounded-lg object-cover" />
              ) : null}
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">
                  Inactive packages stay hidden from customers.
                </p>
              </div>
              <Switch
                checked={form.active !== false}
                onCheckedChange={(active) => setForm((f) => ({ ...f, active }))}
              />
            </div>
            <Button
              type="button"
              className="mt-2 rounded-full"
              disabled={save.isPending || !form.name.trim()}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {editingId ? "Save changes" : "Create package tier"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
