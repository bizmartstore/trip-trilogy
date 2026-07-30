import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { useState } from "react";
import { toast } from "sonner";

import { ListingCard } from "@/components/listings/listing-card";
import { BookingDialog } from "@/components/booking/booking-dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchListingBySlug, fetchRelated } from "@/lib/api";
import type { Listing } from "@/lib/types";

export const Route = createFileRoute("/listing/$slug")({
  loader: async ({ params }) => {
    const listing = await fetchListingBySlug(params.slug);
    if (!listing) throw notFound();
    return { listing };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Listing unavailable | ExploreHub" }, { name: "robots", content: "noindex" }] };
    }
    const l = loaderData.listing;
    const title = `${l.title} — ${l.destination}, ${l.country} | ExploreHub`;
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
  const { listing } = Route.useLoaderData() as { listing: Listing };
  const navigate = useNavigate();
  const [guests, setGuests] = useState(2);
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);

  const related = useQuery({
    queryKey: ["related", listing.id],
    queryFn: () => fetchRelated(listing),
  });

  const unitPrice = listing.discountPct
    ? Math.round(listing.price * (1 - listing.discountPct / 100))
    : listing.price;
  const total = unitPrice * guests;

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

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Star className="size-4 fill-gold text-gold" />
                <strong className="text-foreground">{listing.rating}</strong> ({listing.reviewCount} reviews)
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4" /> {listing.destination}, {listing.country}
              </span>
              {listing.durationDays ? (
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
                  setSaved((s) => !s);
                  toast.success(saved ? "Removed from favourites" : "Saved to favourites");
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
                            <span className="shrink-0 font-semibold">${r.price}</span>
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
                          <span className="shrink-0 font-semibold">${m.price}</span>
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

              <TabsContent value="reviews" className="mt-8">
                <div className="flex flex-wrap items-center gap-6 rounded-3xl border border-border bg-card p-6">
                  <div className="text-center">
                    <p className="font-display text-5xl font-semibold">{listing.rating}</p>
                    <div className="mt-1 flex justify-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className="size-3.5 fill-gold text-gold" />
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{listing.reviewCount} reviews</p>
                  </div>
                  <Separator orientation="vertical" className="hidden h-16 sm:block" />
                  <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                    Guests consistently praise the organisation, the guide's local knowledge and the
                    value for money. Reviews are only accepted from travellers with a completed
                    booking.
                  </p>
                </div>

                <div className="mt-6 space-y-4">
                  {listing.reviews?.map((r) => (
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
                  ))}
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

          {/* Booking panel */}
          <aside>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="sticky top-28 rounded-3xl border border-border bg-card p-6 shadow-lift"
            >
              <div className="flex items-end gap-2">
                {listing.discountPct ? (
                  <span className="text-base text-muted-foreground line-through">${listing.price}</span>
                ) : null}
                <span className="font-display text-3xl font-semibold">${unitPrice}</span>
                <span className="pb-1 text-sm text-muted-foreground">{listing.unit}</span>
              </div>

              {listing.seatsLeft ? (
                <p className="mt-2 text-sm font-medium text-warning-foreground">
                  Only {listing.seatsLeft} spots left for the next date
                </p>
              ) : null}

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
                    onClick={() => setGuests((g) => Math.min(12, g + 1))}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
              </div>

              <Separator className="my-5" />

              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    ${unitPrice} × {guests}
                  </dt>
                  <dd>${unitPrice * guests}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Service fee</dt>
                  <dd className="text-success">Included</dd>
                </div>
                <div className="flex justify-between border-t border-border pt-3 text-base font-semibold">
                  <dt>Total</dt>
                  <dd>${total}</dd>
                </div>
              </dl>

              <Button variant="hero" size="xl" className="mt-6 w-full" onClick={() => setOpen(true)}>
                <CalendarDays className="size-4.5" /> Reserve now
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {listing.cancellationPolicy}
              </p>
            </motion.div>
          </aside>
        </div>

        {/* Related */}
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
        open={open}
        onOpenChange={setOpen}
        listing={listing}
        guests={guests}
        total={total}
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
              active === i ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "opacity-80 hover:opacity-100"
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
  const { lat, lng } = listing.coords;
  const bbox = `${lng - 0.08},${lat - 0.06},${lng + 0.08},${lat + 0.06}`;
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
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`}
        />
      </div>
    </div>
  );
}
