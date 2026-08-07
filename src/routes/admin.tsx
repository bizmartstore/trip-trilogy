import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ContactSettings } from "@/components/admin/contact-settings";
import { RevenuePanel } from "@/components/admin/revenue-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import {
  createListing,
  deleteListing,
  fetchAllListingsAdmin,
  fetchBookings,
  inviteAdmin,
  listAdmins,
  removeAdminInvite,
  updateBookingStatus,
  updateListing,
} from "@/lib/api";
import { isMainAdminEmail } from "@/lib/constants";
import { filesToImageText } from "@/lib/image-text";
import type { Booking, Listing, ListingInput, ListingKind } from "@/lib/types";
import { peso } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Console — Approvals & Content | ExploreHub" },
      {
        name: "description",
        content:
          "Approve bookings, manage tours, stays and dining, invite admins, and keep the ExploreHub marketplace current.",
      },
    ],
  }),
  component: Admin,
});

const emptyForm = (): ListingInput & { id?: string } => ({
  kind: "tour",
  title: "",
  tagline: "",
  description: "",
  destination: "El Nido",
  country: "Palawan",
  category: "Experience",
  price: 0,
  unit: "per person",
  images: [],
  amenities: [],
  tags: [],
  businessName: "",
  featured: false,
  status: "approved",
  cancellationPolicy: "Free cancellation up to 48 hours before.",
});

function Admin() {
  const { user, ready, isAdmin } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      toast.error("Sign in with an admin account to open the console");
      navigate({ to: "/auth" });
      return;
    }
    if (!isAdmin) {
      toast.error("This account is not an admin");
      navigate({ to: "/dashboard" });
    }
  }, [ready, user, isAdmin, navigate]);

  const bookings = useQuery({
    queryKey: ["bookings"],
    queryFn: fetchBookings,
    enabled: !!isAdmin,
  });
  const listings = useQuery({
    queryKey: ["admin-listings"],
    queryFn: fetchAllListingsAdmin,
    enabled: !!isAdmin,
  });
  const admins = useQuery({
    queryKey: ["admin-team", user?.email],
    queryFn: () => listAdmins(user!.email),
    enabled: !!isAdmin && !!user,
  });

  const pendingBookings = useMemo(
    () => bookings.data?.filter((b) => b.status === "pending") ?? [],
    [bookings.data],
  );

  const moderate = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "confirmed" | "rejected" | "approved" }) =>
      updateBookingStatus(id, status),
    onSuccess: ({ id, status }) => {
      qc.setQueryData<Booking[]>(["bookings"], (old) =>
        old?.map((b) => (b.id === id ? { ...b, status } : b)),
      );
      void qc.invalidateQueries({ queryKey: ["bookings"] });
      toast.success(`Booking ${status}`);
    },
    onError: () => toast.error("Could not update booking"),
  });

  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [amenitiesText, setAmenitiesText] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [uploading, setUploading] = useState(false);

  const openCreate = (kind: ListingKind = "tour") => {
    setForm({ ...emptyForm(), kind });
    setAmenitiesText("");
    setTagsText("");
    setEditorOpen(true);
  };

  const openEdit = (listing: Listing) => {
    setForm({
      id: listing.id,
      kind: listing.kind,
      title: listing.title,
      tagline: listing.tagline,
      description: listing.description,
      destination: listing.destination,
      country: listing.country,
      category: listing.category,
      price: listing.price,
      unit: listing.unit,
      images: listing.images,
      amenities: listing.amenities,
      tags: listing.tags,
      businessName: listing.businessName,
      featured: !!listing.featured,
      status: listing.status,
      durationDays: listing.durationDays,
      seatsLeft: listing.seatsLeft,
      discountPct: listing.discountPct,
      cancellationPolicy: listing.cancellationPolicy,
    });
    setAmenitiesText(listing.amenities.join(", "));
    setTagsText(listing.tags.join(", "));
    setEditorOpen(true);
  };

  const saveListing = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const payload: ListingInput = {
        ...form,
        amenities: amenitiesText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        tags: tagsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        images: form.images.length
          ? form.images
          : [
              "data:image/svg+xml," +
                encodeURIComponent(
                  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect fill="#0b2b2b" width="100%" height="100%"/><text x="50%" y="50%" fill="#c9a96e" font-size="28" text-anchor="middle" dy=".3em">ExploreHub</text></svg>',
                ),
            ],
      };
      if (form.id) return updateListing(user.email, form.id, payload);
      return createListing(user.email, payload);
    },
    onSuccess: () => {
      toast.success(form.id ? "Listing updated" : "Listing published");
      setEditorOpen(false);
      void qc.invalidateQueries({ queryKey: ["admin-listings"] });
      void qc.invalidateQueries({ queryKey: ["featured"] });
      void qc.invalidateQueries({ queryKey: ["trending"] });
      void qc.invalidateQueries({ queryKey: ["recent"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });

  const removeListing = useMutation({
    mutationFn: (id: string) => deleteListing(user!.email, id),
    onSuccess: () => {
      toast.success("Listing deleted");
      void qc.invalidateQueries({ queryKey: ["admin-listings"] });
    },
    onError: () => toast.error("Could not delete listing"),
  });

  const invite = useMutation({
    mutationFn: () => inviteAdmin(user!.email, inviteEmail),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Admin invite saved — they become admin when they register");
      setInviteEmail("");
      void qc.invalidateQueries({ queryKey: ["admin-team"] });
    },
    onError: () => toast.error("Invite failed"),
  });

  const revoke = useMutation({
    mutationFn: (email: string) => removeAdminInvite(user!.email, email),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Invite removed");
      void qc.invalidateQueries({ queryKey: ["admin-team"] });
    },
  });

  const onUploadImages = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const texts = await filesToImageText(files);
      if (!texts.length) {
        toast.error("Choose image files only");
        return;
      }
      setForm((f) => ({ ...f, images: [...f.images, ...texts].slice(0, 6) }));
      toast.success("Images converted to compact text and ready to publish");
    } catch {
      toast.error("Could not process images");
    } finally {
      setUploading(false);
    }
  };

  if (!ready || !isAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center pt-28">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  const mainAdmin = user ? isMainAdminEmail(user.email) : false;

  return (
    <div className="pt-28 pb-16">
      <div className="container-x">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <ShieldCheck className="size-3.5" /> Administrator
            </span>
            <h1 className="mt-4 truncate text-3xl font-semibold sm:text-4xl">Marketplace console</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Signed in as {user?.email}
              {mainAdmin ? " · Main admin" : ""}
            </p>
          </div>
          <Badge className="shrink-0 rounded-full border-0 bg-success/15 text-success">
            Live sync on
          </Badge>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Pending bookings</p>
            <p className="mt-2 font-display text-3xl font-semibold">{pendingBookings.length}</p>
          </div>
          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Listings</p>
            <p className="mt-2 font-display text-3xl font-semibold">{listings.data?.length ?? 0}</p>
          </div>
          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Admins</p>
            <p className="mt-2 font-display text-3xl font-semibold">
              {admins.data?.ok ? admins.data.admins.length : "—"}
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-border bg-card p-6 shadow-soft">
          <Tabs defaultValue="bookings">
            <TabsList className="flex h-auto flex-wrap rounded-full">
              <TabsTrigger value="bookings" className="rounded-full">
                Bookings
              </TabsTrigger>
              <TabsTrigger value="content" className="rounded-full">
                Tours · Stays · Dining
              </TabsTrigger>
              <TabsTrigger value="revenue" className="rounded-full">
                Revenue
              </TabsTrigger>
              <TabsTrigger value="contact" className="rounded-full">
                Contact details
              </TabsTrigger>
              <TabsTrigger value="admins" className="rounded-full">
                Admins
              </TabsTrigger>
            </TabsList>

            <TabsContent value="bookings" className="mt-6 overflow-x-auto">
              {bookings.isLoading ? (
                <Skeleton className="h-40 w-full rounded-2xl" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Guest</TableHead>
                      <TableHead>Listing</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Moderate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bookings.data?.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono text-xs">{b.reference}</TableCell>
                        <TableCell>
                          <div className="min-w-0">
                            <p className="truncate whitespace-nowrap font-medium">{b.customer}</p>
                            {b.customerEmail ? (
                              <p className="truncate text-xs text-muted-foreground">{b.customerEmail}</p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate">{b.listingTitle}</TableCell>
                        <TableCell className="whitespace-nowrap">{b.date}</TableCell>
                        <TableCell>{peso(b.total)}</TableCell>
                        <TableCell>
                          <StatusBadge status={b.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          {b.status === "pending" ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="rounded-full"
                                disabled={moderate.isPending}
                                onClick={() => moderate.mutate({ id: b.id, status: "rejected" })}
                              >
                                <XCircle className="size-4" /> Reject
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-full"
                                disabled={moderate.isPending}
                                onClick={() => moderate.mutate({ id: b.id, status: "confirmed" })}
                              >
                                <CheckCircle2 className="size-4" /> Approve
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {!bookings.isLoading && !bookings.data?.length ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No bookings yet. Client reservations will appear here automatically.
                </p>
              ) : null}
            </TabsContent>

            <TabsContent value="content" className="mt-6 space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button className="rounded-full" variant="hero" onClick={() => openCreate("tour")}>
                  <Plus className="size-4" /> Add tour
                </Button>
                <Button className="rounded-full" variant="outline" onClick={() => openCreate("stay")}>
                  <Plus className="size-4" /> Add stay
                </Button>
                <Button
                  className="rounded-full"
                  variant="outline"
                  onClick={() => openCreate("restaurant")}
                >
                  <Plus className="size-4" /> Add dining
                </Button>
              </div>

              {listings.isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-2xl" />
                  ))
                : listings.data?.map((l) => (
                    <div
                      key={l.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-2xl border border-border p-4"
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <img
                          src={l.images[0]}
                          alt=""
                          className="size-14 shrink-0 rounded-xl object-cover"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{l.title}</p>
                          <p className="truncate text-sm text-muted-foreground">
                            {l.kind} · {l.destination} · {peso(l.price)}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          onClick={() => openEdit(l)}
                        >
                          <Pencil className="size-4" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-full text-destructive"
                          disabled={removeListing.isPending}
                          onClick={() => {
                            if (confirm(`Delete “${l.title}”?`)) removeListing.mutate(l.id);
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
            </TabsContent>

            <TabsContent value="revenue" className="mt-6">
              <RevenuePanel bookings={bookings.data ?? []} />
            </TabsContent>

            <TabsContent value="contact" className="mt-6">
              {user ? <ContactSettings actorEmail={user.email} /> : null}
            </TabsContent>

            <TabsContent value="admins" className="mt-6 space-y-6">
              {mainAdmin ? (
                <form
                  className="flex flex-col gap-3 sm:flex-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    invite.mutate();
                  }}
                >
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@email.com"
                    className="h-11 rounded-xl"
                    required
                  />
                  <Button type="submit" variant="hero" className="rounded-full" disabled={invite.isPending}>
                    {invite.isPending ? <Loader2 className="size-4 animate-spin" /> : "Invite as admin"}
                  </Button>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Only the main admin ({`sheethappenswithjaa@gmail.com`}) can invite other admins.
                </p>
              )}

              <div>
                <h3 className="text-sm font-semibold">Pending invites</h3>
                <ul className="mt-3 space-y-2">
                  {admins.data?.ok && admins.data.invites.length
                    ? admins.data.invites.map((email) => (
                        <li
                          key={email}
                          className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 text-sm"
                        >
                          <span>{email}</span>
                          {mainAdmin ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="rounded-full"
                              onClick={() => revoke.mutate(email)}
                            >
                              Remove
                            </Button>
                          ) : null}
                        </li>
                      ))
                    : (
                      <p className="text-sm text-muted-foreground">No pending invites.</p>
                    )}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold">Active admins</h3>
                <ul className="mt-3 space-y-2">
                  {admins.data?.ok
                    ? admins.data.admins.map((a) => (
                        <li
                          key={a.email}
                          className="rounded-2xl border border-border px-4 py-3 text-sm"
                        >
                          <p className="font-medium">{a.name}</p>
                          <p className="text-muted-foreground">{a.email}</p>
                        </li>
                      ))
                    : null}
                </ul>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/dashboard" className="underline-offset-4 hover:underline">
            Back to traveller dashboard
          </Link>
        </p>
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {form.id ? "Edit listing" : "Add listing"}
            </DialogTitle>
            <DialogDescription>
              Photos are compressed into text data-URLs so they still display as images without
              storage quota.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Kind</Label>
              <Select
                value={form.kind}
                onValueChange={(v) => setForm((f) => ({ ...f, kind: v as ListingKind }))}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  <SelectItem value="tour">Tour</SelectItem>
                  <SelectItem value="stay">Stay</SelectItem>
                  <SelectItem value="restaurant">Dining</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Title</Label>
              <Input
                className="h-11 rounded-xl"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Tagline</Label>
              <Input
                className="h-11 rounded-xl"
                value={form.tagline}
                onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Description</Label>
              <Textarea
                className="min-h-28 rounded-xl"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Destination</Label>
              <Input
                className="h-11 rounded-xl"
                value={form.destination}
                onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input
                className="h-11 rounded-xl"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Price (PHP)</Label>
              <Input
                type="number"
                className="h-11 rounded-xl"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Input
                className="h-11 rounded-xl"
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Business name</Label>
              <Input
                className="h-11 rounded-xl"
                value={form.businessName}
                onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Amenities (comma-separated)</Label>
              <Input
                className="h-11 rounded-xl"
                value={amenitiesText}
                onChange={(e) => setAmenitiesText(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Tags (comma-separated)</Label>
              <Input
                className="h-11 rounded-xl"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Photos</Label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground hover:bg-muted/40">
                <Upload className="size-4" />
                {uploading ? "Compressing to text…" : "Upload images (stored as text)"}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => void onUploadImages(e.target.files)}
                />
              </label>
              {form.images.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {form.images.map((src, i) => (
                    <button
                      key={i}
                      type="button"
                      className="relative"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          images: f.images.filter((_, idx) => idx !== i),
                        }))
                      }
                      title="Remove"
                    >
                      <img src={src} alt="" className="size-16 rounded-xl object-cover" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 sm:col-span-2">
              <div>
                <p className="text-sm font-medium">Featured on homepage</p>
                <p className="text-xs text-muted-foreground">Appear in editor picks</p>
              </div>
              <Switch
                checked={!!form.featured}
                onCheckedChange={(v) => setForm((f) => ({ ...f, featured: v }))}
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" className="rounded-full" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="hero"
              className="rounded-full"
              disabled={saveListing.isPending || !form.title || !form.description}
              onClick={() => saveListing.mutate()}
            >
              {saveListing.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save listing"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
