import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  Coins,
  Compass,
  CreditCard,
  Loader2,
  type LucideIcon,
  Mail,
  MapPin,
  MessageSquare,
  Package,
  Pencil,
  Phone,
  Plus,
  ScrollText,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
  Users,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ContactSettings } from "@/components/admin/contact-settings";
import { PolicyContentSettings } from "@/components/admin/policy-content-settings";
import { CustomersPanel } from "@/components/admin/customers-panel";
import { DestinationsPanel } from "@/components/admin/destinations-panel";
import { LiveBookingFeed } from "@/components/admin/live-booking-feed";
import { ListingPackagesEditor } from "@/components/admin/listing-packages-editor";
import { PackagesPanel } from "@/components/admin/packages-panel";
import { AdminBookingCalendar } from "@/components/admin/admin-booking-calendar";
import { NotificationBroadcast } from "@/components/admin/notification-broadcast";
import { RevenuePanel } from "@/components/admin/revenue-panel";
import { TestimonialsPanel } from "@/components/admin/testimonials-panel";
import { BookingDetailsList } from "@/components/booking/booking-details";
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
  fetchDestinations,
  fetchPackages,
  inviteAdmin,
  listAdmins,
  listCustomers,
  namesFromDestinationCatalog,
  removeAdminInvite,
  removeCustomer,
  removeListingReview,
  resetRevenue,
  updateBookingStatus,
  updateListing,
} from "@/lib/api";
import { isMainAdminEmail } from "@/lib/constants";
import { filesToImageText } from "@/lib/image-text";
import {
  bookingDurationLabel,
  formatDateTime,
  listingUsesSchedule,
  PRICING_TYPE_LABELS,
  resolvePricingType,
  unitLabelForPricing,
} from "@/lib/booking-model";
import {
  coordsForDestination,
  isDestinationDefaultPin,
  osmEmbedUrl,
  parseMapLocation,
  sanitizeCoords,
} from "@/lib/listing-map";
import type {
  Booking,
  BookingStatus,
  Listing,
  ListingInput,
  ListingKind,
  PricingType,
} from "@/lib/types";
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
  available: true,
  unavailableReason: "",
  durationDays: 1,
  durationNights: 0,
  startTime: "08:00",
  endTime: "18:00",
  autoEndDate: true,
  pricingType: "per_person",
  packageIds: [],
  packages: [],
  cancellationPolicy: "Free cancellation up to 48 hours before.",
  showMap: true,
  mapHidden: false,
  coords: coordsForDestination("El Nido"),
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
  const destinations = useQuery({
    queryKey: ["destinations"],
    queryFn: fetchDestinations,
    enabled: !!isAdmin,
  });
  const packageCatalog = useQuery({
    queryKey: ["packages"],
    queryFn: fetchPackages,
    enabled: !!isAdmin,
  });
  const admins = useQuery({
    queryKey: ["admin-team", user?.email],
    queryFn: () => listAdmins(user!.email),
    enabled: !!isAdmin && !!user,
    staleTime: 0,
  });

  const adminTeam = useMemo(() => {
    if (!admins.data?.ok) return [];
    const active = admins.data.admins.map((a) => ({
      email: a.email,
      name: a.name,
      status: "active" as const,
    }));
    const activeEmails = new Set(active.map((a) => a.email));
    const pending = admins.data.invites
      .filter((email) => !activeEmails.has(email))
      .map((email) => ({
        email,
        name: email.split("@")[0],
        status: "pending" as const,
      }));
    return [...active, ...pending];
  }, [admins.data]);

  const customers = useQuery({
    queryKey: ["admin-customers", user?.email],
    queryFn: () => listCustomers(user!.email),
    enabled: !!isAdmin && !!user,
  });

  const pendingBookings = useMemo(
    () => bookings.data?.filter((b) => b.status === "pending") ?? [],
    [bookings.data],
  );

  const [review, setReview] = useState<{
    booking: Booking;
    status: BookingStatus;
  } | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [bookingDetail, setBookingDetail] = useState<Booking | null>(null);
  const [availabilityTarget, setAvailabilityTarget] = useState<Listing | null>(null);
  const [unavailableReasonDraft, setUnavailableReasonDraft] = useState("");

  const moderate = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: BookingStatus; note?: string }) =>
      updateBookingStatus(id, status, { note, actorEmail: user?.email }),
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
  const [mapPaste, setMapPaste] = useState("");

  const destinationChoices = useMemo(() => {
    const names = namesFromDestinationCatalog(destinations.data, listings.data);
    const typed = form.destination.trim();
    if (typed && !names.includes(typed)) names.push(typed);
    return names;
  }, [destinations.data, listings.data, form.destination]);

  const applyDestination = (destination: string, keepCustomPin = false) => {
    const match = destinations.data?.find(
      (d) => d.name.trim().toLowerCase() === destination.trim().toLowerCase(),
    );
    const pin = coordsForDestination(destination, destinations.data);
    setForm((f) => ({
      ...f,
      destination,
      country: match?.country || f.country,
      coords:
        keepCustomPin &&
        sanitizeCoords(f.coords) &&
        !isDestinationDefaultPin(f.coords, f.destination, destinations.data)
          ? f.coords
          : pin,
    }));
    setMapPaste("");
  };

  const pinToDestination = (destination: string) => applyDestination(destination);

  const openCreate = (kind: ListingKind = "tour") => {
    const preferred =
      destinations.data?.find((d) => d.name === "El Nido") ?? destinations.data?.[0];
    const isPackage = kind === "package";
    const activeIds = (packageCatalog.data ?? [])
      .filter((p) => p.active !== false)
      .map((p) => p.id);
    setForm({
      ...emptyForm(),
      kind,
      unit: isPackage
        ? "per package"
        : kind === "stay"
          ? "per night"
          : kind === "restaurant"
            ? "per cover"
            : "per person",
      pricingType: isPackage ? "per_package" : kind === "stay" ? "per_night" : "per_person",
      packageIds: isPackage ? activeIds : [],
      durationDays: isPackage ? undefined : kind === "stay" ? 2 : 1,
      durationNights: isPackage ? undefined : kind === "stay" ? 1 : 0,
      price: 0,
      category: isPackage
        ? "Travel package"
        : kind === "stay"
          ? "Stay"
          : kind === "restaurant"
            ? "Dining"
            : "Experience",
      destination: preferred?.name ?? "El Nido",
      country: preferred?.country ?? "Palawan",
      coords: coordsForDestination(preferred?.name ?? "El Nido", destinations.data),
    });
    setAmenitiesText("");
    setTagsText("");
    setMapPaste("");
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
      available: listing.available !== false,
      unavailableReason: listing.unavailableReason ?? "",
      durationDays: listing.durationDays ?? 1,
      durationNights: listing.durationNights,
      startTime: listing.startTime ?? "08:00",
      endTime: listing.endTime ?? "18:00",
      autoEndDate: listing.autoEndDate !== false,
      pricingType: resolvePricingType(listing),
      packageIds:
        listing.packageIds ?? (listing.packages?.length ? listing.packages.map((p) => p.id) : []),
      packages: listing.packages ?? [],
      seatsLeft: listing.seatsLeft,
      discountPct: listing.discountPct,
      cancellationPolicy: listing.cancellationPolicy,
      showMap: listing.showMap !== false && listing.mapHidden !== true,
      coords: listing.coords ?? coordsForDestination(listing.destination, destinations.data),
    });
    setAmenitiesText(listing.amenities.join(", "));
    setTagsText(listing.tags.join(", "));
    setMapPaste("");
    setEditorOpen(true);
  };

  const saveListing = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const isPackage = form.kind === "package";
      const selectedTierPrices = (packageCatalog.data ?? [])
        .filter((p) => (form.packageIds ?? []).includes(p.id) && p.active !== false)
        .map((p) => p.price)
        .filter((n) => Number.isFinite(n) && n >= 0);
      const fromTier = selectedTierPrices.length ? Math.min(...selectedTierPrices) : 0;
      const payload: ListingInput = {
        ...form,
        pricingType: isPackage ? "per_package" : form.pricingType,
        unit: isPackage ? "per package" : form.unit,
        // Package products inherit price/duration from assigned tiers at checkout.
        price: isPackage ? fromTier : form.price,
        durationDays: isPackage ? undefined : form.durationDays,
        durationNights: isPackage ? undefined : form.durationNights,
        amenities: amenitiesText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        tags: tagsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        discountPct:
          form.discountPct && form.discountPct > 0 ? Math.min(90, form.discountPct) : undefined,
        coords:
          sanitizeCoords(form.coords) ?? coordsForDestination(form.destination, destinations.data),
        showMap: form.showMap !== false,
        mapHidden: form.showMap === false,
        available: form.available !== false,
        unavailableReason:
          form.available === false ? form.unavailableReason?.trim() || undefined : undefined,
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
      void qc.invalidateQueries({ queryKey: ["destinations"] });
      void qc.invalidateQueries({ queryKey: ["featured"] });
      void qc.invalidateQueries({ queryKey: ["trending"] });
      void qc.invalidateQueries({ queryKey: ["recent"] });
      void qc.invalidateQueries({ queryKey: ["listing"] });
      void qc.invalidateQueries({ queryKey: ["search"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });

  const removeListing = useMutation({
    mutationFn: (id: string) => deleteListing(user!.email, id),
    onSuccess: () => {
      toast.success("Listing deleted");
      void qc.invalidateQueries({ queryKey: ["admin-listings"] });
      void qc.invalidateQueries({ queryKey: ["destinations"] });
      void qc.invalidateQueries({ queryKey: ["search"] });
    },
    onError: () => toast.error("Could not delete listing"),
  });

  const setListingAvailability = useMutation({
    mutationFn: ({
      id,
      available,
      unavailableReason,
    }: {
      id: string;
      available: boolean;
      unavailableReason?: string;
    }) =>
      updateListing(user!.email, id, {
        available,
        unavailableReason: available ? undefined : unavailableReason?.trim() || undefined,
      }),
    onSuccess: (_data, vars) => {
      toast.success(vars.available ? "Listing marked available" : "Listing marked unavailable");
      setAvailabilityTarget(null);
      setUnavailableReasonDraft("");
      void qc.invalidateQueries({ queryKey: ["admin-listings"] });
      void qc.invalidateQueries({ queryKey: ["featured"] });
      void qc.invalidateQueries({ queryKey: ["trending"] });
      void qc.invalidateQueries({ queryKey: ["recent"] });
      void qc.invalidateQueries({ queryKey: ["listing"] });
      void qc.invalidateQueries({ queryKey: ["search"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Could not update availability"),
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
      qc.setQueryData(
        ["admin-team", user?.email],
        (old: Awaited<ReturnType<typeof listAdmins>> | undefined) => {
          if (!old?.ok) {
            return {
              ok: true as const,
              invites: result.invites,
              mainAdmin: isMainAdminEmail(user!.email),
              admins: [],
            };
          }
          return { ...old, invites: result.invites };
        },
      );
      void qc.invalidateQueries({ queryKey: ["admin-team"] });
    },
    onError: () => toast.error("Invite failed"),
  });

  const deleteCustomer = useMutation({
    mutationFn: (customerEmail: string) => removeCustomer(user!.email, customerEmail),
    onSuccess: (result, customerEmail) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Customer removed");
      qc.setQueryData(
        ["admin-customers", user?.email],
        (old: Awaited<ReturnType<typeof listCustomers>> | undefined) => {
          if (!old?.ok) return old;
          return {
            ...old,
            customers: old.customers.filter((c) => c.email !== customerEmail),
          };
        },
      );
      void qc.invalidateQueries({ queryKey: ["admin-customers"] });
    },
    onError: () => toast.error("Could not remove customer"),
  });

  const revoke = useMutation({
    mutationFn: (email: string) => removeAdminInvite(user!.email, email),
    onSuccess: (result, email) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.wasActiveAdmin ? "Admin removed" : "Invite removed");
      qc.setQueryData(
        ["admin-team", user?.email],
        (old: Awaited<ReturnType<typeof listAdmins>> | undefined) => {
          if (!old?.ok) return old;
          return {
            ...old,
            invites: result.invites,
            admins: old.admins.filter((a) => a.email !== email),
          };
        },
      );
      void qc.invalidateQueries({ queryKey: ["admin-team"] });
    },
    onError: () => toast.error("Could not remove admin"),
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
      toast.success("Images uploaded and ready to publish");
    } catch {
      toast.error("Could not process images");
    } finally {
      setUploading(false);
    }
  };

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center pt-28">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 pt-28 text-center">
        <p className="text-sm text-muted-foreground">
          {!user
            ? "Sign in with an admin account to open the console."
            : "This account is not an admin."}
        </p>
        <Button asChild variant="hero" className="rounded-full">
          <Link to={!user ? "/auth" : "/dashboard"}>{!user ? "Sign in" : "Go to dashboard"}</Link>
        </Button>
      </div>
    );
  }

  const mainAdmin = user ? isMainAdminEmail(user.email) : false;

  const statCards: { label: string; value: string | number; Icon: LucideIcon; accent?: boolean }[] =
    [
      {
        label: "Pending bookings",
        value: pendingBookings.length,
        Icon: CreditCard,
        accent: pendingBookings.length > 0,
      },
      { label: "Listings", value: listings.data?.length ?? 0, Icon: Compass },
      {
        label: "Customers",
        value: customers.data?.ok ? customers.data.customers.length : "—",
        Icon: Users,
      },
      {
        label: "Admins",
        value: admins.data?.ok ? adminTeam.length : "—",
        Icon: ShieldCheck,
      },
    ];

  const adminTabs: { value: string; label: string; shortLabel: string; Icon: LucideIcon }[] = [
    { value: "bookings", label: "Bookings", shortLabel: "Bookings", Icon: CreditCard },
    { value: "calendar", label: "Calendar", shortLabel: "Calendar", Icon: CalendarDays },
    { value: "packages", label: "Packages", shortLabel: "Packages", Icon: Package },
    {
      value: "content",
      label: "Tours · Stays · Dining",
      shortLabel: "Listings",
      Icon: Compass,
    },
    { value: "destinations", label: "Destinations", shortLabel: "Places", Icon: MapPin },
    { value: "revenue", label: "Revenue", shortLabel: "Revenue", Icon: Coins },
    { value: "contact", label: "Contact details", shortLabel: "Contact", Icon: Phone },
    { value: "policies", label: "Policies", shortLabel: "Policies", Icon: ScrollText },
    { value: "messages", label: "Messages", shortLabel: "Messages", Icon: MessageSquare },
    { value: "customers", label: "Customers", shortLabel: "Guests", Icon: Users },
    { value: "feedback", label: "Feedback", shortLabel: "Feedback", Icon: Star },
    { value: "admins", label: "Admins", shortLabel: "Admins", Icon: ShieldCheck },
  ];

  return (
    <div className="pt-24 pb-[max(4rem,calc(3rem+env(safe-area-inset-bottom)))] sm:pt-28">
      <div className="container-x">
        <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <ShieldCheck className="size-3.5" /> Administrator
            </span>
            <h1 className="mt-3 truncate text-2xl font-semibold sm:mt-4 sm:text-4xl">
              Marketplace console
            </h1>
            <p className="mt-1 truncate text-xs text-muted-foreground sm:mt-2 sm:text-sm">
              Signed in as {user?.email}
              {mainAdmin ? " · Main admin" : ""}
            </p>
          </div>
          <Badge className="hidden shrink-0 rounded-full border-0 bg-success/15 text-success sm:inline-flex">
            Live sync on
          </Badge>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {statCards.map(({ label, value, Icon, accent }) => (
            <div
              key={label}
              className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground sm:text-xs">
                  {label}
                </p>
                <span
                  className={
                    accent
                      ? "grid size-7 place-items-center rounded-full bg-destructive/10 text-destructive"
                      : "grid size-7 place-items-center rounded-full bg-primary/10 text-primary"
                  }
                >
                  <Icon className={accent ? "size-3.5 animate-pulse" : "size-3.5"} />
                </span>
              </div>
              <p className="mt-2 font-display text-2xl font-semibold sm:text-3xl">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-3xl border border-border bg-card p-4 shadow-soft sm:mt-8 sm:p-6">
          <Tabs defaultValue="bookings">
            <div className="-mx-4 overflow-x-auto px-4 pb-1 no-scrollbar [scrollbar-width:none] sm:mx-0 sm:px-0">
              <TabsList className="flex h-auto w-max min-w-full items-center gap-1 rounded-full p-1">
                {adminTabs.map(({ value, label, shortLabel, Icon }) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    title={label}
                    className="shrink-0 gap-1.5 rounded-full px-3 py-2 text-xs sm:px-4 sm:text-sm"
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="sm:hidden">{shortLabel}</span>
                    <span className="hidden sm:inline">{label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

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
                        <TableHead>Start</TableHead>
                        <TableHead>End</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Package</TableHead>
                        <TableHead>Guests</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Moderate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bookings.data?.map((b) => (
                        <TableRow
                          key={b.id}
                          className="cursor-pointer"
                          onClick={() => setBookingDetail(b)}
                        >
                          <TableCell className="font-mono text-xs">{b.reference}</TableCell>
                          <TableCell>
                            <div className="min-w-0">
                              <p className="truncate whitespace-nowrap font-medium">{b.customer}</p>
                              {b.customerEmail ? (
                                <p className="truncate text-xs text-muted-foreground">
                                  {b.customerEmail}
                                </p>
                              ) : null}
                              {b.customerPhone ? (
                                <p className="truncate text-xs text-muted-foreground">
                                  {b.customerPhone}
                                </p>
                              ) : null}
                              {b.guestCheckout ? (
                                <Badge
                                  variant="outline"
                                  className="mt-1 rounded-full border-primary/40 bg-primary/10 px-2 py-0 text-[10px] font-medium uppercase tracking-wide text-primary"
                                >
                                  Guest · no account
                                </Badge>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate">{b.listingTitle}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {formatDateTime(b.startDate || b.date, b.startTime) || b.date}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {formatDateTime(b.endDate || b.startDate || b.date, b.endTime) ||
                              b.endDate ||
                              b.date}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {bookingDurationLabel(b)}
                          </TableCell>
                          <TableCell className="max-w-[120px] truncate text-xs">
                            {b.packageNameSnapshot || "—"}
                            {b.pricingType ? (
                              <p className="text-[11px] text-muted-foreground">
                                {PRICING_TYPE_LABELS[b.pricingType] ??
                                  b.pricingType.replaceAll("_", " ")}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell>{b.guests}</TableCell>
                          <TableCell>{peso(b.total)}</TableCell>
                          <TableCell>
                            <StatusBadge status={b.status} />
                            {b.paymentMethod ? (
                              <p className="mt-1 whitespace-nowrap text-[11px] text-muted-foreground">
                                via {b.paymentMethod}
                              </p>
                            ) : null}
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
                                  onClick={(e) => {
                                    e.stopPropagation();
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
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setReviewNote("");
                                    setReview({ booking: b, status: "approved" });
                                  }}
                                >
                                  <CheckCircle2 className="size-4" /> Approve
                                </Button>
                              </div>
                            ) : ["approved", "confirmed", "partial_payment"].includes(b.status) ? (
                              <div className="flex justify-end gap-2">
                                {b.status !== "partial_payment" ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="rounded-full"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setReviewNote("");
                                      setReview({ booking: b, status: "partial_payment" });
                                    }}
                                  >
                                    Partial payment
                                  </Button>
                                ) : null}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="rounded-full"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setReviewNote("");
                                    setReview({ booking: b, status: "completed_payment" });
                                  }}
                                >
                                  Completed payment
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="rounded-full text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setReviewNote("");
                                    setReview({ booking: b, status: "rejected" });
                                  }}
                                >
                                  <XCircle className="size-4" /> Reject
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

            <TabsContent value="calendar" className="mt-6">
              <AdminBookingCalendar
                bookings={bookings.data ?? []}
                onSelect={(b) => setBookingDetail(b)}
              />
            </TabsContent>

            <TabsContent value="packages" className="mt-6">
              {user ? <PackagesPanel actorEmail={user.email} /> : null}
            </TabsContent>

            <TabsContent value="content" className="mt-6 space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button className="rounded-full" variant="hero" onClick={() => openCreate("tour")}>
                  <Plus className="size-4" /> Add tour
                </Button>
                <Button
                  className="rounded-full"
                  variant="outline"
                  onClick={() => openCreate("stay")}
                >
                  <Plus className="size-4" /> Add stay
                </Button>
                <Button
                  className="rounded-full"
                  variant="outline"
                  onClick={() => openCreate("restaurant")}
                >
                  <Plus className="size-4" /> Add dining
                </Button>
                <Button
                  className="rounded-full"
                  variant="outline"
                  onClick={() => openCreate("package")}
                >
                  <Plus className="size-4" /> Add package
                </Button>
              </div>

              {listings.isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-2xl" />
                  ))
                : listings.data?.map((l) => (
                    <div key={l.id} className="rounded-2xl border border-border p-4">
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
                              {l.discountPct ? ` · ${l.discountPct}% off` : ""}
                              {l.reviewCount ? ` · ${l.rating} (${l.reviewCount} reviews)` : ""}
                              {l.showMap === false || l.mapHidden ? " · map hidden" : ""}
                              {l.available === false
                                ? ` · unavailable${l.unavailableReason ? `: ${l.unavailableReason}` : ""}`
                                : " · available"}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                          <div className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5">
                            <span className="text-xs text-muted-foreground">
                              {l.available === false ? "Unavailable" : "Available"}
                            </span>
                            <Switch
                              checked={l.available !== false}
                              disabled={setListingAvailability.isPending}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setListingAvailability.mutate({ id: l.id, available: true });
                                  return;
                                }
                                setAvailabilityTarget(l);
                                setUnavailableReasonDraft(l.unavailableReason ?? "");
                              }}
                              aria-label={`Toggle availability for ${l.title}`}
                            />
                          </div>
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

            <TabsContent value="destinations" className="mt-6">
              {user ? <DestinationsPanel actorEmail={user.email} /> : null}
            </TabsContent>

            <TabsContent value="revenue" className="mt-6">
              <RevenuePanel
                bookings={bookings.data ?? []}
                isMainAdmin={mainAdmin}
                onResetRevenue={async (code) => {
                  const result = await resetRevenue(user!.email, code);
                  if (result.ok) {
                    qc.setQueryData<Booking[]>(["admin-bookings"], []);
                    qc.setQueryData(["booking-feed"], { source: "live", bookings: [] });
                    void qc.invalidateQueries({ queryKey: ["admin-bookings"] });
                    void qc.invalidateQueries({ queryKey: ["booking-feed"] });
                  }
                  return result;
                }}
              />
            </TabsContent>

            <TabsContent value="contact" className="mt-6">
              {user ? <ContactSettings actorEmail={user.email} /> : null}
            </TabsContent>

            <TabsContent value="policies" className="mt-6">
              {user ? <PolicyContentSettings actorEmail={user.email} /> : null}
            </TabsContent>

            <TabsContent value="messages" className="mt-6">
              {user ? <NotificationBroadcast actorEmail={user.email} /> : null}
            </TabsContent>

            <TabsContent value="customers" className="mt-6">
              <CustomersPanel
                customers={customers.data?.ok ? customers.data.customers : []}
                loading={customers.isLoading}
                isMainAdmin={mainAdmin}
                removingEmail={deleteCustomer.isPending ? deleteCustomer.variables : null}
                onRemove={
                  mainAdmin ? (customer) => deleteCustomer.mutate(customer.email) : undefined
                }
              />
            </TabsContent>

            <TabsContent value="feedback" className="mt-6">
              {user ? <TestimonialsPanel actorEmail={user.email} /> : null}
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
                  <Button
                    type="submit"
                    variant="hero"
                    className="rounded-full"
                    disabled={invite.isPending}
                  >
                    {invite.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      "Invite as admin"
                    )}
                  </Button>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Only the main admin can invite other admins.
                </p>
              )}

              <div>
                <h3 className="text-sm font-semibold">Admin team</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pending invites become active admins once the person registers. Only the main
                  admin can remove an active admin or a pending invite.
                </p>
                <ul className="mt-3 space-y-2">
                  {adminTeam.length ? (
                    adminTeam.map((member) => (
                      <li
                        key={member.email}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{member.name}</p>
                          <p className="truncate text-muted-foreground">{member.email}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge
                            variant="outline"
                            className={
                              member.status === "active"
                                ? "rounded-full border-success/30 bg-success/10 text-success"
                                : "rounded-full border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                            }
                          >
                            {member.status === "active" ? "Active" : "Pending"}
                          </Badge>
                          {mainAdmin ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="rounded-full text-destructive"
                              disabled={revoke.isPending}
                              onClick={() => {
                                const message =
                                  member.status === "active"
                                    ? `Remove ${member.name} (${member.email})? They will no longer be able to sign in.`
                                    : `Remove the pending invite for ${member.email}?`;
                                if (confirm(message)) revoke.mutate(member.email);
                              }}
                            >
                              {revoke.isPending && revoke.variables === member.email ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : null}
                              Remove
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No admins yet. Invite someone above to get started.
                    </p>
                  )}
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
              Upload photos for this listing. Images are compressed automatically before saving.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Kind</Label>
              <Select
                value={form.kind}
                onValueChange={(v) => {
                  const kind = v as ListingKind;
                  const isPackage = kind === "package";
                  const activeIds = (packageCatalog.data ?? [])
                    .filter((p) => p.active !== false)
                    .map((p) => p.id);
                  setForm((f) => ({
                    ...f,
                    kind,
                    unit: isPackage
                      ? "per package"
                      : kind === "stay"
                        ? "per night"
                        : kind === "restaurant"
                          ? "per cover"
                          : f.pricingType === "per_package"
                            ? "per package"
                            : f.unit,
                    pricingType: isPackage
                      ? "per_package"
                      : kind === "restaurant"
                        ? "per_person"
                        : f.pricingType,
                    packageIds: isPackage
                      ? f.packageIds?.length
                        ? f.packageIds
                        : activeIds
                      : f.packageIds,
                  }));
                }}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  <SelectItem value="tour">Tour</SelectItem>
                  <SelectItem value="stay">Stay</SelectItem>
                  <SelectItem value="restaurant">Dining</SelectItem>
                  <SelectItem value="package">Package</SelectItem>
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
              <Select value={form.destination} onValueChange={pinToDestination}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Choose a destination" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  {destinationChoices.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="h-11 rounded-xl"
                placeholder="Or type another place"
                value={form.destination}
                onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (!next) return;
                  applyDestination(next, true);
                }}
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
            {form.kind !== "package" ? (
              <>
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
                  <Label>Discount (% off, optional)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={90}
                    className="h-11 rounded-xl"
                    placeholder="No discount"
                    value={form.discountPct ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setForm((f) => ({
                        ...f,
                        discountPct:
                          raw === "" ? undefined : Math.min(90, Math.max(0, Number(raw))),
                      }));
                    }}
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
                <div className="space-y-2">
                  <Label>Pricing type</Label>
                  <Select
                    value={form.pricingType ?? "per_person"}
                    onValueChange={(value) => {
                      const pricingType = value as PricingType;
                      const activeIds = (packageCatalog.data ?? [])
                        .filter((p) => p.active !== false)
                        .map((p) => p.id);
                      setForm((f) => ({
                        ...f,
                        pricingType,
                        unit: unitLabelForPricing(pricingType, f.kind),
                        packageIds:
                          pricingType === "per_package"
                            ? f.packageIds?.length
                              ? f.packageIds
                              : activeIds
                            : f.packageIds,
                      }));
                    }}
                  >
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_person">Per Person</SelectItem>
                      {(form.kind === "tour" || form.kind === "stay") && (
                        <SelectItem value="per_night">Per Night</SelectItem>
                      )}
                      {(form.kind === "tour" || form.kind === "stay") && (
                        <SelectItem value="per_package">Per Package</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <div className="space-y-2 sm:col-span-2">
                <Label>Discount (% off, optional)</Label>
                <Input
                  type="number"
                  min={0}
                  max={90}
                  className="h-11 rounded-xl"
                  placeholder="Applied to selected tier price"
                  value={form.discountPct ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setForm((f) => ({
                      ...f,
                      discountPct: raw === "" ? undefined : Math.min(90, Math.max(0, Number(raw))),
                    }));
                  }}
                />
                <p className="text-[11px] text-muted-foreground">
                  Price, days, and nights come from each package tier customers select at checkout.
                </p>
              </div>
            )}
            {listingUsesSchedule(form.kind) ? (
              <>
                {form.kind !== "package" ? (
                  <>
                    <div className="space-y-2">
                      <Label>Number of days</Label>
                      <Input
                        type="number"
                        min={1}
                        className="h-11 rounded-xl"
                        value={form.durationDays ?? 1}
                        onChange={(e) => {
                          const days = Math.max(1, Number(e.target.value) || 1);
                          setForm((f) => ({
                            ...f,
                            durationDays: days,
                            durationNights:
                              f.autoEndDate === false ? f.durationNights : Math.max(0, days - 1),
                          }));
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Number of nights</Label>
                      <Input
                        type="number"
                        min={0}
                        className="h-11 rounded-xl"
                        value={form.durationNights ?? Math.max(0, (form.durationDays ?? 1) - 1)}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            durationNights: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                      />
                    </div>
                  </>
                ) : null}
                <div className="space-y-2">
                  <Label>Start time</Label>
                  <Input
                    type="time"
                    className="h-11 rounded-xl"
                    value={form.startTime ?? "08:00"}
                    onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End time</Label>
                  <Input
                    type="time"
                    className="h-11 rounded-xl"
                    value={form.endTime ?? "18:00"}
                    onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Capacity (spots)</Label>
                  <Input
                    type="number"
                    min={0}
                    className="h-11 rounded-xl"
                    placeholder="Unlimited"
                    value={form.seatsLeft ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        seatsLeft:
                          e.target.value === ""
                            ? undefined
                            : Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 sm:col-span-2">
                  <div>
                    <p className="text-sm font-medium">Auto-calculate end date</p>
                    <p className="text-xs text-muted-foreground">
                      {form.kind === "package"
                        ? "End date is start date plus the selected package tier’s days/nights."
                        : "End date is start date plus duration (e.g. 3 days / 2 nights)."}
                    </p>
                  </div>
                  <Switch
                    checked={form.autoEndDate !== false}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, autoEndDate: v }))}
                  />
                </div>
              </>
            ) : null}
            {(form.kind === "package" || form.pricingType === "per_package") &&
            listingUsesSchedule(form.kind) ? (
              <ListingPackagesEditor
                catalog={packageCatalog.data ?? []}
                selectedIds={form.packageIds ?? []}
                onChange={(packageIds) => setForm((f) => ({ ...f, packageIds }))}
              />
            ) : null}
            {form.kind === "package" ? (
              <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground sm:col-span-2">
                Customers choose an available tier (Standard / Premium / Luxury, etc.). Checkout,
                calendar occupancy, receipts, and notifications use that tier’s price, duration, and
                inclusions automatically.
              </p>
            ) : null}
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
                {uploading ? "Uploading…" : "Upload images"}
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

            <div className="space-y-3 rounded-2xl border border-border p-4 sm:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Available for booking</p>
                  <p className="text-xs text-muted-foreground">
                    Turn off when fully booked or temporarily closed. Tourists still see it, but
                    cannot open or reserve it.
                  </p>
                </div>
                <Switch
                  checked={form.available !== false}
                  onCheckedChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      available: v,
                      unavailableReason: v ? "" : f.unavailableReason,
                    }))
                  }
                  aria-label="Available for booking"
                />
              </div>
              {form.available === false ? (
                <div className="space-y-1.5">
                  <Label htmlFor="unavailable-reason">Reason shown to tourists</Label>
                  <Textarea
                    id="unavailable-reason"
                    rows={2}
                    className="rounded-xl"
                    placeholder="Fully booked…"
                    value={form.unavailableReason ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, unavailableReason: e.target.value }))}
                  />
                </div>
              ) : null}
            </div>

            <div className="space-y-3 rounded-2xl border border-border p-4 sm:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <MapPin className="size-4 text-primary" />
                    Location map
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Shown on the public listing. Turn this off to hide the map, or set an exact pin
                    when photos and place change.
                  </p>
                </div>
                <Switch
                  checked={form.showMap !== false}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, showMap: v, mapHidden: !v }))}
                  aria-label="Show location map on the public listing"
                />
              </div>

              {form.showMap !== false ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Latitude</Label>
                      <Input
                        type="number"
                        step="any"
                        className="h-11 rounded-xl"
                        value={form.coords?.lat ?? ""}
                        onChange={(e) => {
                          const lat = Number(e.target.value);
                          setForm((f) => ({
                            ...f,
                            coords: {
                              lat: Number.isFinite(lat) ? lat : 0,
                              lng: f.coords?.lng ?? 0,
                            },
                          }));
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Longitude</Label>
                      <Input
                        type="number"
                        step="any"
                        className="h-11 rounded-xl"
                        value={form.coords?.lng ?? ""}
                        onChange={(e) => {
                          const lng = Number(e.target.value);
                          setForm((f) => ({
                            ...f,
                            coords: {
                              lat: f.coords?.lat ?? 0,
                              lng: Number.isFinite(lng) ? lng : 0,
                            },
                          }));
                        }}
                      />
                    </div>
                  </div>
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
                    {mapPaste && !parseMapLocation(mapPaste) ? (
                      <p className="text-xs text-muted-foreground">
                        Could not read a pin from that link. Try coordinates like 11.1949, 119.4013.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => {
                        pinToDestination(form.destination);
                        toast.success(`Pinned to ${form.destination || "Palawan"}`);
                      }}
                    >
                      Reset pin to {form.destination || "destination"}
                    </Button>
                    {sanitizeCoords(form.coords) ? (
                      <Button type="button" variant="ghost" className="rounded-full" asChild>
                        <a
                          href={`https://www.google.com/maps?q=${form.coords!.lat},${form.coords!.lng}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open in Google Maps
                        </a>
                      </Button>
                    ) : null}
                  </div>
                  {isDestinationDefaultPin(form.coords, form.destination, destinations.data) ? (
                    <p className="text-xs text-muted-foreground">
                      Currently using the {form.destination} town pin. Paste a map link for the
                      exact stay, restaurant or meeting point.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Custom pin saved with this listing. Changing destination will move it unless
                      you paste a new map link.
                    </p>
                  )}
                  {sanitizeCoords(form.coords) ? (
                    <div className="overflow-hidden rounded-2xl border border-border">
                      <iframe
                        key={`${form.coords?.lat},${form.coords?.lng}`}
                        title="Map preview"
                        className="h-48 w-full"
                        src={osmEmbedUrl(sanitizeCoords(form.coords)!)}
                      />
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  The location map is hidden on the public listing page.
                </p>
              )}
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
              {review
                ? review.status === "approved"
                  ? "Approve reservation"
                  : review.status === "partial_payment"
                    ? "Mark partial payment received"
                    : review.status === "completed_payment"
                      ? "Mark payment completed"
                      : "Reject reservation"
                : ""}
            </DialogTitle>
            <DialogDescription>
              {review
                ? `${review.booking.reference} · ${review.booking.customer} · ${peso(review.booking.total)}`
                : ""}
              {review &&
              (review.status === "partial_payment" || review.status === "completed_payment") ? (
                <span className="mt-1 block">
                  {review.status === "partial_payment"
                    ? "The tourist has settled part of the total. They still owe the remaining balance."
                    : "Confirm that the full amount has been received. This adds the reservation to revenue."}
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {review ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-secondary/30 p-4 text-sm">
                <BookingDetailsList booking={review.booking} compact />
                {review.booking.customerPhone ? (
                  <p className="mt-2 text-xs text-muted-foreground">
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
                      : review.status === "partial_payment" || review.status === "completed_payment"
                        ? "Paid in cash at the office…"
                        : "Fully booked on that date…"
                  }
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Saved with a timestamp and shown on the traveller&apos;s dashboard.
                  {review.status === "rejected" ? " Also sent to the admin Telegram group." : ""}
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" className="rounded-full" onClick={() => setReview(null)}>
                  Cancel
                </Button>
                <Button
                  variant={review.status === "rejected" ? "destructive" : "hero"}
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
                  ) : review.status === "partial_payment" ? (
                    "Partial payment received"
                  ) : review.status === "completed_payment" ? (
                    "Payment completed"
                  ) : (
                    "Reject booking"
                  )}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!availabilityTarget}
        onOpenChange={(v) => {
          if (!v) {
            setAvailabilityTarget(null);
            setUnavailableReasonDraft("");
          }
        }}
      >
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Mark unavailable</DialogTitle>
            <DialogDescription>
              {availabilityTarget
                ? `${availabilityTarget.title} will stay visible, but tourists cannot open or book it.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="availability-reason">Reason (shown on homepage)</Label>
              <Textarea
                id="availability-reason"
                rows={3}
                className="rounded-xl"
                placeholder="Fully booked…"
                value={unavailableReasonDraft}
                onChange={(e) => setUnavailableReasonDraft(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  setAvailabilityTarget(null);
                  setUnavailableReasonDraft("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="rounded-full"
                disabled={setListingAvailability.isPending || !availabilityTarget}
                onClick={() => {
                  if (!availabilityTarget) return;
                  setListingAvailability.mutate({
                    id: availabilityTarget.id,
                    available: false,
                    unavailableReason: unavailableReasonDraft,
                  });
                }}
              >
                {setListingAvailability.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Mark unavailable"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!bookingDetail} onOpenChange={(v) => !v && setBookingDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Booking details</DialogTitle>
            <DialogDescription>
              {bookingDetail ? `${bookingDetail.reference} · ${bookingDetail.customer}` : ""}
            </DialogDescription>
          </DialogHeader>
          {bookingDetail ? (
            <div className="space-y-4">
              <BookingDetailsList booking={bookingDetail} />
              {bookingDetail.status === "pending" ? (
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    className="rounded-full"
                    onClick={() => {
                      setReviewNote("");
                      setReview({ booking: bookingDetail, status: "rejected" });
                      setBookingDetail(null);
                    }}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="hero"
                    className="rounded-full"
                    onClick={() => {
                      setReviewNote("");
                      setReview({ booking: bookingDetail, status: "approved" });
                      setBookingDetail(null);
                    }}
                  >
                    Approve
                  </Button>
                </div>
              ) : ["approved", "confirmed", "partial_payment"].includes(bookingDetail.status) ? (
                <div className="flex justify-end gap-2">
                  {bookingDetail.status !== "partial_payment" ? (
                    <Button
                      variant="outline"
                      className="rounded-full"
                      onClick={() => {
                        setReviewNote("");
                        setReview({ booking: bookingDetail, status: "partial_payment" });
                        setBookingDetail(null);
                      }}
                    >
                      Partial payment
                    </Button>
                  ) : null}
                  <Button
                    variant="hero"
                    className="rounded-full"
                    onClick={() => {
                      setReviewNote("");
                      setReview({ booking: bookingDetail, status: "completed_payment" });
                      setBookingDetail(null);
                    }}
                  >
                    Completed payment
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
