import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  BadgeCheck,
  CalendarDays,
  Check,
  ChevronLeft,
  Clock,
  Heart,
  MapPin,
  Minus,
  Plus,
  Share2,
  Star,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ListingCard } from "@/components/listings/listing-card";
import { ReviewForm } from "@/components/listings/review-form";
import { BookingDialog } from "@/components/booking/booking-dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchFavorites, fetchListingBySlug, fetchRelated, toggleFavorite } from "@/lib/api";
import {
  activePackages,
  discountedUnitPrice,
  formatDateTime,
  formatDurationLabel,
  listingDurationLabel,
  listingUsesSchedule,
  PRICING_TYPE_LABELS,
  quoteBooking,
  resolvePricingType,
  unitLabelForPricing,
} from "@/lib/booking-model";
import { listingShowsMap, osmEmbedUrl, resolveListingCoords } from "@/lib/listing-map";
import { isListingAvailable, type Listing } from "@/lib/types";
import { peso } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/listing/$slug")({
  headers: () => ({
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  }),
  loader: async ({ params }) => {
    const listing = await fetchListingBySlug(params.slug);
    if (!listing) throw notFound();
    return { listing };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Listing unavailable | Nexora" }, { name: "robots", content: "noindex" }] };
    }
    const l = loaderData.listing;
    const title = `${l.title} — ${l.destination}, ${l.country} | Nexora`;
    return {
      meta: [
        { title },
        { name: "description", content: l.tagline },
        { property: "og:title", content: title },
        { property: "og:description", content: l.tagline },
        { property: "og:image", content: l.images[0] },
        { name: "twitter:image", content: l.images[0] },
      ],
    };
  },
  errorComponent: () => (
    <div className="container-x pt-40 pb-24 text-center">
      <h1 className="text-2xl font-semibold">This listing didn't load</h1>
      <Button asChild variant="outline" className="mt-6 rounded-full">
        <Link to="/explore" search={{ kind: "all" }}>Back to explore</Link>
      </Button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="container-x pt-40 pb-24 text-center">
      <h1 className="text-2xl font-semibold">We couldn't find that listing</h1>
      <Button asChild variant="outline" className="mt-6 rounded-full">
        <Link to="/explore" search={{ kind: "all" }}>Back to explore</Link>
      </Button>
    </div>
  ),
  component: ListingDetail,
});

function ListingDetail() {
  const { listing: initialListing } = Route.useLoaderData() as { listing: Listing };
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [guests, setGuests] = useState(2);
  const [startDate, setStartDate] = useState("");
  const [open, setOpen] = useState(false);

  const listingQuery = useQuery({
    queryKey: ["listing", initialListing.slug],
    queryFn: () => fetchListingBySlug(initialListing.slug),
    initialData: initialListing,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const listing = listingQuery.data ?? initialListing;
  const available = isListingAvailable(listing);
  const pricingType = resolvePricingType(listing);
  const packages = useMemo(() => activePackages(listing), [listing]);
  const needsPackage = pricingType === "per_package";
  const usesSchedule = listingUsesSchedule(listing.kind);
  const durationLabel = listingDurationLabel(listing);
  const unitLabel = unitLabelForPricing(pricingType, listing.kind);
  const fromPackagePrice = packages.length
    ? Math.min(...packages.map((pkg) => discountedUnitPrice(pkg.price, listing.discountPct)))
    : null;

  const quote = useMemo(() => {
    // Package listings quote only after a tier is chosen inside Reserve Now.
    if (!startDate || needsPackage) return null;
    return quoteBooking(listing, {
      guests,
      startDate,
    });
  }, [listing, guests, startDate, needsPackage]);

  const displayUnitPrice =
    quote?.unitPrice ??
    (listing.discountPct
      ? Math.round(listing.price * (1 - listing.discountPct / 100))
      : listing.price);
  const total =
    quote?.total ??
    (needsPackage
      ? (fromPackagePrice ?? displayUnitPrice) *
        (packages[0] && packages[0].pricingType === "per_night" ? 1 : guests)
      : pricingType === "per_night"
        ? displayUnitPrice
        : displayUnitPrice * guests);
  const maxGuests = 12;

  useEffect(() => {
    if (guests > maxGuests) setGuests(maxGuests);
  }, [guests, maxGuests]);

  const favorites = useQuery({
    queryKey: ["favorites", user?.email],
    queryFn: () => fetchFavorites(user!.email),
    enabled: !!user,
  });
  const saved = favorites.data?.some((l) => l.id === listing.id) ?? false;

  const save = useMutation({
    mutationFn: () => toggleFavorite(user!.email, listing.id),
    onSuccess: (result) => {
      toast.success(result.saved ? "Saved to favourites" : "Removed from favourites");
      void qc.invalidateQueries({ queryKey: ["favorites", user?.email] });
    },
    onError: () => toast.error("Sign in to save listings"),
  });

  const related = useQuery({
    queryKey: ["related", listing.id],
    queryFn: () => fetchRelated(listing),
  });

  const userReview = user
    ? listing.reviews?.some((r) => r.email === user.email.toLowerCase())
    : false;

  const canReserve =
    available &&
    !!startDate &&
    (!needsPackage || packages.length > 0);

  return (
    <div className="pt-24">
      <div className="container-x">
        <Button
          variant="ghost"
          className="mb-4 rounded-full"
          onClick={() => navigate({ to: "/explore", search: { kind: "all" } })}
        >
          <ChevronLeft className="size-4" /> Back to results
        </Button>

        <Gallery listing={listing} />

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full">{listing.category}</Badge>
              <Badge variant="outline" className="gap-1 rounded-full">
                <BadgeCheck className="size-3.5 text-primary" /> Verified partner
              </Badge>
              {listing.discountPct ? (
                <Badge className="rounded-full border-0 bg-gold text-gold-foreground">
                  {listing.discountPct}% off
                </Badge>
              ) : null}
            </div>

            <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">{listing.title}</h1>
            <p className="mt-2 text-lg text-muted-foreground">{listing.tagline}</p>

            {!available ? (
              <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <p className="font-semibold">Not available</p>
                <p className="mt-1">
                  {listing.unavailableReason?.trim() ||
                    "This listing cannot be reserved right now."}
                </p>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Star className="size-4 fill-gold text-gold" />
                {listing.reviewCount ? (
                  <>
                    <strong className="text-foreground">{listing.rating}</strong> ({listing.reviewCount}{" "}
                    reviews)
                  </>
                ) : (
                  <span className="text-foreground">No ratings yet</span>
                )}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4" /> {listing.destination}, {listing.country}
              </span>
              {durationLabel ? (
                <span className="flex items-center gap-1.5">
                  <Clock className="size-4" /> {durationLabel}
                </span>
              ) : listing.durationDays ? (
                <span className="flex items-center gap-1.5">
                  <Clock className="size-4" /> {listing.durationDays} day
                  {listing.durationDays > 1 ? "s" : ""}
                </span>
              ) : null}
              <span>by {listing.businessName}</span>
            </div>

            <div className="mt-6 flex gap-2">
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  if (!user) {
                    void navigate({ to: "/auth" });
                    return;
                  }
                  save.mutate();
                }}
              >
                <Heart className={saved ? "size-4 fill-destructive text-destructive" : "size-4"} />
                {saved ? "Saved" : "Save"}
              </Button>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => toast.success("Link copied to clipboard")}
              >
                <Share2 className="size-4" /> Share
              </Button>
            </div>

            <Separator className="my-8" />

            <p className="text-base leading-relaxed text-foreground/90">{listing.description}</p>

            <Tabs defaultValue="details" className="mt-10">
              <TabsList className="rounded-full">
                <TabsTrigger value="details" className="rounded-full">Details</TabsTrigger>
                <TabsTrigger value="reviews" className="rounded-full">Reviews</TabsTrigger>
                <TabsTrigger value="faq" className="rounded-full">FAQ</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="mt-8 space-y-10">
                {listing.itinerary?.length ? (
                  <div>
                    <h2 className="text-xl font-semibold">Itinerary</h2>
                    <ol className="mt-5 space-y-0">
                      {listing.itinerary.map((step, i) => (
                        <li key={step.day} className="relative flex gap-4 pb-8 last:pb-0">
                          <div className="flex flex-col items-center">
                            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                              {i + 1}
                            </span>
                            {i < listing.itinerary!.length - 1 ? (
                              <span className="mt-1 w-px flex-1 bg-border" />
                            ) : null}
                          </div>
                          <div className="min-w-0 pt-1">
                            <h3 className="font-display text-base font-semibold">{step.title}</h3>
                            <p className="mt-1 text-sm text-muted-foreground">{step.detail}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}

                {listing.rooms?.length ? (
                  <div>
                    <h2 className="text-xl font-semibold">Room types</h2>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      {listing.rooms.map((r) => (
                        <div key={r.name} className="rounded-2xl border border-border bg-card p-5">
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="font-display font-semibold">{r.name}</h3>
                            <span className="shrink-0 font-semibold">{peso(r.price)}</span>
                          </div>
                          <p className="mt-1.5 text-sm text-muted-foreground">
                            {r.beds} · sleeps {r.capacity}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {listing.menu?.length ? (
                  <div>
                    <h2 className="text-xl font-semibold">Menu highlights</h2>
                    <div className="mt-5 divide-y divide-border rounded-2xl border border-border bg-card">
                      {listing.menu.map((m) => (
                        <div key={m.name} className="flex items-start justify-between gap-4 p-5">
                          <div className="min-w-0">
                            <h3 className="flex flex-wrap items-center gap-2 font-display font-semibold">
                              {m.name}
                              {m.bestSeller ? (
                                <Badge className="rounded-full border-0 bg-gold text-gold-foreground">
                                  Best seller
                                </Badge>
                              ) : null}
                            </h3>
                            <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>
                            <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                              {m.category}
                            </p>
                          </div>
                          <span className="shrink-0 font-semibold">{peso(m.price)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-8 sm:grid-cols-2">
                  {listing.inclusions?.length ? (
                    <div>
                      <h2 className="text-lg font-semibold">What's included</h2>
                      <ul className="mt-4 space-y-2">
                        {listing.inclusions.map((x) => (
                          <li key={x} className="flex gap-2 text-sm">
                            <Check className="mt-0.5 size-4 shrink-0 text-success" /> {x}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {listing.exclusions?.length ? (
                    <div>
                      <h2 className="text-lg font-semibold">Not included</h2>
                      <ul className="mt-4 space-y-2">
                        {listing.exclusions.map((x) => (
                          <li key={x} className="flex gap-2 text-sm text-muted-foreground">
                            <X className="mt-0.5 size-4 shrink-0" /> {x}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>

                <div>
                  <h2 className="text-lg font-semibold">Amenities & features</h2>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {listing.amenities.map((a) => (
                      <Badge key={a} variant="secondary" className="rounded-full px-3 py-1.5">
                        {a}
                      </Badge>
                    ))}
                  </div>
                </div>

                <MapPanel listing={listing} />
              </TabsContent>

              <TabsContent value="reviews" className="mt-8 space-y-6">
                <div className="flex flex-wrap items-center gap-6 rounded-3xl border border-border bg-card p-6">
                  <div className="text-center">
                    <p className="font-display text-5xl font-semibold">
                      {listing.reviewCount ? listing.rating : "—"}
                    </p>
                    {listing.reviewCount ? (
                      <>
                        <div className="mt-1 flex justify-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`size-3.5 ${i < Math.round(listing.rating) ? "fill-gold text-gold" : "text-muted-foreground/30"}`}
                            />
                          ))}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{listing.reviewCount} reviews</p>
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">Be the first to rate</p>
                    )}
                  </div>
                  <Separator orientation="vertical" className="hidden h-16 sm:block" />
                  <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                    Ratings come from signed-in travellers. Admins may remove reviews that violate
                    community guidelines.
                  </p>
                </div>

                <ReviewForm
                  listingId={listing.id}
                  existingReview={!!userReview}
                  onSubmitted={() => void listingQuery.refetch()}
                />

                <div className="space-y-4">
                  {listing.reviews?.length ? (
                    listing.reviews.map((r) => (
                      <div key={r.id} className="rounded-3xl border border-border bg-card p-6">
                        <div className="flex items-center gap-3">
                          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                            {r.avatar}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{r.author}</p>
                            <p className="text-xs text-muted-foreground">{r.date}</p>
                          </div>
                          <span className="ml-auto flex shrink-0 gap-0.5">
                            {Array.from({ length: r.rating }).map((_, i) => (
                              <Star key={i} className="size-3.5 fill-gold text-gold" />
                            ))}
                          </span>
                        </div>
                        <p className="mt-4 text-sm leading-relaxed text-foreground/90">{r.body}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-sm text-muted-foreground">No reviews yet.</p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="faq" className="mt-8">
                <Accordion type="single" collapsible className="rounded-3xl border border-border bg-card px-6">
                  {listing.faqs?.map((f, i) => (
                    <AccordionItem key={i} value={`item-${i}`}>
                      <AccordionTrigger className="text-left font-display">{f.q}</AccordionTrigger>
                      <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
                <p className="mt-6 rounded-2xl bg-secondary/60 p-5 text-sm text-muted-foreground">
                  <strong className="text-foreground">Cancellation policy: </strong>
                  {listing.cancellationPolicy}
                </p>
              </TabsContent>
            </Tabs>
          </div>

          <aside>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="sticky top-28 rounded-3xl border border-border bg-card p-6 shadow-lift"
            >
              <div className="flex items-end gap-2">
                {listing.discountPct && pricingType !== "per_package" ? (
                  <span className="text-base text-muted-foreground line-through">{peso(listing.price)}</span>
                ) : null}
                {needsPackage ? (
                  <>
                    <span className="pb-1 text-sm text-muted-foreground">From</span>
                    <span className="font-display text-3xl font-semibold">
                      {peso(fromPackagePrice ?? displayUnitPrice)}
                    </span>
                  </>
                ) : (
                  <span className="font-display text-3xl font-semibold">{peso(displayUnitPrice)}</span>
                )}
                <span className="pb-1 text-sm text-muted-foreground">
                  {needsPackage ? "per package" : unitLabel}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {needsPackage
                  ? packages.length
                    ? `${packages.length} package tier${packages.length === 1 ? "" : "s"} · choose on Reserve`
                    : "Package tiers open when you reserve"
                  : PRICING_TYPE_LABELS[pricingType]}
                {!needsPackage && durationLabel ? ` · ${durationLabel}` : ""}
              </p>

              {listing.seatsLeft ? (
                <p className="mt-2 text-sm font-medium text-warning-foreground">
                  Capacity: {listing.seatsLeft} guest{listing.seatsLeft === 1 ? "" : "s"} max across
                  overlapping dates
                </p>
              ) : null}

              <Separator className="my-5" />

              <div className="space-y-2">
                <Label htmlFor="booking-start-date" className="text-sm font-medium">
                  {usesSchedule ? "Start date" : "Preferred date"}
                </Label>
                <Input
                  id="booking-start-date"
                  type="date"
                  className="h-11 rounded-xl"
                  value={startDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                {quote && usesSchedule && !needsPackage ? (
                  <div className="rounded-2xl bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground">End:</span>{" "}
                      {formatDateTime(quote.endDate, quote.endTime)}
                    </p>
                    <p className="mt-0.5">
                      <span className="font-medium text-foreground">Duration:</span>{" "}
                      {formatDurationLabel(quote.durationDays, quote.durationNights)}
                    </p>
                  </div>
                ) : null}
                {needsPackage ? (
                  <p className="text-xs text-muted-foreground">
                    End date and duration appear after you choose a package tier.
                  </p>
                ) : null}
              </div>

              <Separator className="my-5" />

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Users className="size-4" /> Guests
                </span>
                <div className="flex items-center gap-3">
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-8 rounded-full"
                    aria-label="Decrease guests"
                    onClick={() => setGuests((g) => Math.max(1, g - 1))}
                  >
                    <Minus className="size-3.5" />
                  </Button>
                  <span className="w-6 text-center font-semibold">{guests}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-8 rounded-full"
                    aria-label="Increase guests"
                    onClick={() => setGuests((g) => Math.min(maxGuests, g + 1))}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
              </div>

              <Separator className="my-5" />

              <dl className="space-y-2 text-sm">
                {pricingType === "per_person" ? (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">
                      {peso(displayUnitPrice)} × {guests} guest{guests === 1 ? "" : "s"}
                    </dt>
                    <dd>{peso(displayUnitPrice * guests)}</dd>
                  </div>
                ) : null}
                {pricingType === "per_night" && quote ? (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">
                      {peso(displayUnitPrice)} ×{" "}
                      {Math.max(1, quote.durationNights || quote.durationDays)} night
                      {Math.max(1, quote.durationNights || quote.durationDays) === 1 ? "" : "s"}
                    </dt>
                    <dd>{peso(quote.subtotal)}</dd>
                  </div>
                ) : null}
                {needsPackage ? (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Package total</dt>
                    <dd className="text-muted-foreground">After tier selection</dd>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Service fee</dt>
                  <dd className="text-success">Included</dd>
                </div>
                <div className="flex justify-between border-t border-border pt-3 text-base font-semibold">
                  <dt>Total</dt>
                  <dd>{needsPackage ? "—" : peso(total)}</dd>
                </div>
              </dl>

              <Button
                variant="hero"
                size="xl"
                className="mt-6 w-full"
                disabled={!available}
                onClick={() => {
                  if (!available) {
                    toast.error(
                      listing.unavailableReason?.trim() ||
                        "This listing is currently unavailable.",
                    );
                    return;
                  }
                  if (!startDate) {
                    toast.error(usesSchedule ? "Choose a start date." : "Choose a date.");
                    return;
                  }
                  if (needsPackage && packages.length === 0) {
                    toast.error("Packages are not configured for this listing yet.");
                    return;
                  }
                  setOpen(true);
                }}
              >
                <CalendarDays className="size-4.5" />{" "}
                {available
                  ? needsPackage
                    ? "Reserve now"
                    : canReserve
                      ? `Reserve · ${peso(total)}`
                      : "Reserve now"
                  : "Unavailable"}
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {available
                  ? listing.cancellationPolicy
                  : listing.unavailableReason?.trim() ||
                    "This listing is not accepting reservations."}
              </p>
            </motion.div>
          </aside>
        </div>

        <section className="section">
          <h2 className="text-2xl font-semibold sm:text-3xl">You might also like</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-[4/5] rounded-3xl" />
                ))
              : related.data?.map((l, i) => <ListingCard key={l.id} listing={l} index={i} />)}
          </div>
        </section>
      </div>

      <BookingDialog
        open={available && open}
        onOpenChange={setOpen}
        listing={listing}
        guests={guests}
        startDate={startDate}
        total={needsPackage ? 0 : total}
      />
    </div>
  );
}

function Gallery({ listing }: { listing: Listing }) {
  const [active, setActive] = useState(0);
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <motion.div
        key={active}
        initial={{ opacity: 0.4, scale: 1.01 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="aspect-[16/10] overflow-hidden rounded-3xl"
      >
        <img
          src={listing.images[active]}
          alt={listing.title}
          width={1200}
          height={750}
          className="size-full object-cover"
        />
      </motion.div>
      <div className="grid grid-cols-4 gap-3 md:grid-cols-2">
        {listing.images.slice(0, 4).map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`View image ${i + 1}`}
            className={`aspect-square overflow-hidden rounded-2xl transition-all md:aspect-auto ${
              active === i
                ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                : "opacity-80 hover:opacity-100"
            }`}
          >
            <img src={src} alt="" loading="lazy" className="size-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

function MapPanel({ listing }: { listing: Listing }) {
  if (!listingShowsMap(listing)) return null;
  const coords = resolveListingCoords(listing);
  if (!coords) return null;
  return (
    <div>
      <h2 className="text-lg font-semibold">Location</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {listing.destination}, {listing.country}
      </p>
      <div className="mt-4 overflow-hidden rounded-3xl border border-border">
        <iframe
          title={`Map of ${listing.title}`}
          className="h-80 w-full"
          loading="lazy"
          src={osmEmbedUrl(coords)}
        />
      </div>
    </div>
  );
}
