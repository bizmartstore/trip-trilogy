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
import { LiveBookingFeed } from "@/components/admin/live-booking-feed";
import { NotificationBroadcast } from "@/components/admin/notification-broadcast";
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
  fetchAdminBookings,
  fetchAllListingsAdmin,
  inviteAdmin,
  listAdmins,
  removeAdminInvite,
  removeListingReview,
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
      { title: "Admin Console — Approvals & Content | Nexora" },
      {
        name: "description",
        content:
          "Approve bookings, manage tours, stays and dining, invite admins, and keep the Nexora marketplace current.",
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
    queryKey: ["admin-bookings"],
    queryFn: fetchAdminBookings,
    enabled: !!isAdmin,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
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

  const [review, setReview] = useState<{
    booking: Booking;
    status: "approved" | "rejected";
  } | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const moderate = useMutation({
    mutationFn: ({
      id,
      status,
      note,
    }: {
      id: string;
      status: "confirmed" | "rejected" | "approved";
      note?: string;
    }) => updateBookingStatus(id, status, { note, actorEmail: user?.email }),
    onSuccess: (result) => {
      qc.setQueryData<Booking[]>(["admin-bookings"], (old) =>
        old?.map((b) => (b.id === result.id ? { ...b, ...result } : b)),
      );
      void qc.invalidateQueries({ queryKey: ["admin-bookings"] });
      void qc.invalidateQueries({ queryKey: ["booking-feed"] });
      setReview(null);
      setReviewNote("");
      toast.success(`Booking ${result.status}`);
    },
    onError: () => toast.error("Could not update booking"),
  });

  const removeReview = useMutation({
    mutationFn: ({ listingId, reviewId }: { listingId: string; reviewId: string }) =>
      removeListingReview(user!.email, listingId, reviewId),
    onSuccess: () => {
      toast.success("Review removed");
      void qc.invalidateQueries({ queryKey: ["admin-listings"] });
    },
    onError: () => toast.error("Could not remove review"),
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
                  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect fill="#0b2b2b" width="100%" height="100%"/><text x="50%" y="50%" fill="#c9a96e" font-size="28" text-anchor="middle" dy=".3em">Nexora</text></svg>',
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
              <TabsTrigger value="messages" className="rounded-full">
                Messages
              </TabsTrigger>
              <TabsTrigger value="admins" className="rounded-full">
                Admins
              </TabsTrigger>
            </TabsList>

            <TabsContent value="bookings" className="mt-6 space-y-6">
              <LiveBookingFeed />
              <div className="overflow-x-auto">
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
                          {b.statusUpdatedAt ? (
                            <p className="mt-1 whitespace-nowrap text-[11px] text-muted-foreground">
                              {new Date(b.statusUpdatedAt).toLocaleString()}
                            </p>
                          ) : null}
                          {b.adminNote ? (
                            <p className="max-w-[200px] truncate text-[11px] italic text-muted-foreground">
                              “{b.adminNote}”
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          {b.status === "pending" ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="rounded-full"
                                onClick={() => {
                                  setReviewNote("");
                                  setReview({ booking: b, status: "rejected" });
                                }}
                              >
                                <XCircle className="size-4" /> Reject
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-full"
                                onClick={() => {
                                  setReviewNote("");
                                  setReview({ booking: b, status: "approved" });
                                }}
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
              </div>
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
                      className="rounded-2xl border border-border p-4"
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
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
                              {l.reviewCount ? ` · ${l.rating} (${l.reviewCount} reviews)` : ""}
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
                      {l.reviews?.length ? (
                        <div className="mt-4 space-y-2 border-t border-border pt-4">
                          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                            Traveller ratings (optional removal)
                          </p>
                          {l.reviews.map((r) => (
                            <div
                              key={r.id}
                              className="flex flex-col gap-2 rounded-xl bg-secondary/40 p-3 sm:flex-row sm:items-start sm:justify-between"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium">
                                  {r.author} · {r.rating}/5
                                </p>
                                <p className="mt-1 text-sm text-muted-foreground">{r.body}</p>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="shrink-0 rounded-full text-destructive"
                                disabled={removeReview.isPending}
                                onClick={() => {
                                  if (confirm("Remove this review?")) {
                                    removeReview.mutate({ listingId: l.id, reviewId: r.id });
                                  }
                                }}
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
            </TabsContent>

            <TabsContent value="revenue" className="mt-6">
              <RevenuePanel bookings={bookings.data ?? []} />
            </TabsContent>

            <TabsContent value="contact" className="mt-6">
              {user ? <ContactSettings actorEmail={user.email} /> : null}
            </TabsContent>

            <TabsContent value="messages" className="mt-6">
              {user ? <NotificationBroadcast actorEmail={user.email} /> : null}
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

      <Dialog open={!!review} onOpenChange={(v) => !v && setReview(null)}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {review?.status === "approved" ? "Approve reservation" : "Reject reservation"}
            </DialogTitle>
            <DialogDescription>
              {review
                ? `${review.booking.reference} · ${review.booking.customer} · ${peso(review.booking.total)}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {review ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-secondary/30 p-4 text-sm">
                <p className="font-medium">{review.booking.listingTitle}</p>
                <p className="text-xs text-muted-foreground">
                  {review.booking.date} · {review.booking.guests} guest
                  {review.booking.guests === 1 ? "" : "s"}
                </p>
                {review.booking.customerPhone ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Contact: {review.booking.customerPhone}
                    {review.booking.notifyPreference
                      ? ` · prefers ${review.booking.notifyPreference}`
                      : ""}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="review-note">
                  Note {review.status === "rejected" ? "(reason)" : "(optional)"}
                </Label>
                <Textarea
                  id="review-note"
                  rows={3}
                  className="rounded-xl"
                  placeholder={
                    review.status === "approved"
                      ? "Confirmed by phone, pickup 6:30 AM…"
                      : "Fully booked on that date…"
                  }
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Saved with a timestamp in Supabase and shown on the traveller's dashboard.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" className="rounded-full" onClick={() => setReview(null)}>
                  Cancel
                </Button>
                <Button
                  variant={review.status === "approved" ? "hero" : "destructive"}
                  className="rounded-full"
                  disabled={moderate.isPending}
                  onClick={() =>
                    moderate.mutate({
                      id: review.booking.id,
                      status: review.status,
                      note: reviewNote,
                    })
                  }
                >
                  {moderate.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : review.status === "approved" ? (
                    "Approve booking"
                  ) : (
                    "Reject booking"
                  )}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
