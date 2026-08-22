import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, Pencil, Plus, Trash2, Upload } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  createDestination,
  deleteDestination,
  fetchDestinations,
  updateDestination,
} from "@/lib/api";
import { filesToImageText } from "@/lib/image-text";
import {
  coordsForDestination,
  osmEmbedUrl,
  parseMapLocation,
  sanitizeCoords,
} from "@/lib/listing-map";
import type { Destination, DestinationInput } from "@/lib/types";

const emptyForm = (): DestinationInput => ({
  name: "",
  country: "Palawan",
  tagline: "",
  image: "",
  coords: coordsForDestination("Palawan"),
});

export function DestinationsPanel({ actorEmail }: { actorEmail: string }) {
  const qc = useQueryClient();
  const destinations = useQuery({ queryKey: ["destinations"], queryFn: fetchDestinations });
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DestinationInput>(emptyForm());
  const [mapPaste, setMapPaste] = useState("");
  const [uploading, setUploading] = useState(false);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setMapPaste("");
    setOpen(true);
  };

  const openEdit = (destination: Destination) => {
    setEditingId(destination.id);
    setForm({
      name: destination.name,
      country: destination.country,
      tagline: destination.tagline,
      image: destination.image,
      coords: destination.coords ?? coordsForDestination(destination.name, destinations.data),
    });
    setMapPaste("");
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload: DestinationInput = {
        ...form,
        name: form.name.trim(),
        country: form.country.trim() || "Palawan",
        tagline: form.tagline.trim(),
        coords: sanitizeCoords(form.coords) ?? coordsForDestination(form.name, destinations.data),
      };
      if (editingId) return updateDestination(actorEmail, editingId, payload);
      return createDestination(actorEmail, payload);
    },
    onSuccess: () => {
      toast.success(editingId ? "Destination updated" : "Destination added");
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["destinations"] });
      void qc.invalidateQueries({ queryKey: ["featured"] });
      void qc.invalidateQueries({ queryKey: ["admin-listings"] });
      void qc.invalidateQueries({ queryKey: ["search"] });
      void qc.invalidateQueries({ queryKey: ["trending"] });
      void qc.invalidateQueries({ queryKey: ["recent"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save destination"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteDestination(actorEmail, id),
    onSuccess: () => {
      toast.success("Destination removed");
      void qc.invalidateQueries({ queryKey: ["destinations"] });
      void qc.invalidateQueries({ queryKey: ["search"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not delete destination"),
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          These places appear on the homepage, in Explore, and in the destination list when you add
          or update tours, stays and dining. Add towns beyond the original Palawan set, then assign
          listings to them.
        </p>
        <Button className="rounded-full" variant="hero" onClick={openCreate}>
          <Plus className="size-4" /> Add destination
        </Button>
      </div>

      {destinations.isLoading ? (
        Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
        ))
      ) : destinations.data?.length ? (
        destinations.data.map((d) => (
          <div key={d.id} className="rounded-2xl border border-border p-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <img src={d.image} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{d.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {d.country} · {d.listings} listing{d.listings === 1 ? "" : "s"}
                    {d.tagline ? ` · ${d.tagline}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => openEdit(d)}>
                  <Pencil className="size-4" /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full text-destructive"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (d.listings > 0) {
                      toast.error("Reassign or delete listings in this destination first.");
                      return;
                    }
                    remove.mutate(d.id);
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        ))
      ) : (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No destinations yet. Add the first place travellers can explore.
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {editingId ? "Edit destination" : "Add destination"}
            </DialogTitle>
            <DialogDescription>
              Name, photo and map pin for the homepage and listing filters.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                className="h-11 rounded-xl"
                placeholder="El Nido"
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({
                    ...f,
                    name,
                    coords: sanitizeCoords(f.coords) ?? coordsForDestination(name, destinations.data),
                  }));
                }}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Country / region</Label>
                <Input
                  className="h-11 rounded-xl"
                  value={form.country}
                  onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Tagline</Label>
                <Input
                  className="h-11 rounded-xl"
                  placeholder="Limestone cliffs & hidden lagoons"
                  value={form.tagline}
                  onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cover photo</Label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground hover:bg-muted/40">
                <Upload className="size-4" />
                {uploading ? "Uploading…" : "Upload image"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => void onUpload(e.target.files)}
                />
              </label>
              {form.image ? (
                <img src={form.image} alt="" className="mt-2 h-28 w-full rounded-2xl object-cover" />
              ) : null}
            </div>
            <div className="space-y-3 rounded-2xl border border-border p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <MapPin className="size-4 text-primary" /> Town map pin
              </p>
              <div className="space-y-2">
                <Label>Paste a map link or coordinates</Label>
                <Input
                  className="h-11 rounded-xl"
                  placeholder="Google Maps / OpenStreetMap link, or 11.1949, 119.4013"
                  value={mapPaste}
                  onChange={(e) => {
                    const value = e.target.value;
                    setMapPaste(value);
                    const parsed = parseMapLocation(value);
                    if (parsed) setForm((f) => ({ ...f, coords: parsed }));
                  }}
                />
              </div>
              {sanitizeCoords(form.coords) ? (
                <div className="overflow-hidden rounded-2xl border border-border">
                  <iframe
                    key={`${form.coords?.lat},${form.coords?.lng}`}
                    title="Destination map preview"
                    className="h-40 w-full"
                    src={osmEmbedUrl(sanitizeCoords(form.coords)!)}
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="hero"
              className="rounded-full"
              disabled={save.isPending || !form.name.trim()}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save destination"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
