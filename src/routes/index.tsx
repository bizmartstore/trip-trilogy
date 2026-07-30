import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BadgeCheck, CalendarRange, Compass, ShieldCheck, Sparkles, UtensilsCrossed, Hotel, Tent } from "lucide-react";

import { Hero } from "@/components/home/hero";
import { SearchStrip } from "@/components/home/search-strip";
import { Testimonials } from "@/components/home/testimonials";
import { DestinationGrid } from "@/components/home/destination-grid";
import { ListingCard, ListingCardSkeleton } from "@/components/listings/listing-card";
import { SectionHeading } from "@/components/shared/section-heading";
import { Button } from "@/components/ui/button";
import { fetchDestinations, fetchFeatured, fetchRecent, fetchTrending } from "@/lib/api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ExploreHub — Palawan Tours, Stays & Dining Marketplace" },
      {
        name: "description",
        content:
          "Discover verified tours, hand-picked hotels and standout restaurants across Palawan. Plan, book and manage every reservation from one premium travel marketplace.",
      },
      { property: "og:title", content: "ExploreHub — Palawan Tours, Stays & Dining Marketplace" },
      {
        property: "og:description",
        content:
          "Discover verified tours, hand-picked hotels and standout restaurants across Palawan. Plan, book and manage every reservation from one premium travel marketplace.",
      },
    ],
  }),
  component: Home,
});

const categories = [
  { icon: Tent, label: "Tours & experiences", copy: "Guided, private and small group", kind: "tour" as const },
  { icon: Hotel, label: "Hotels & resorts", copy: "Boutique stays to beach villas", kind: "stay" as const },
  { icon: UtensilsCrossed, label: "Restaurants", copy: "Tables worth flying for", kind: "restaurant" as const },
  { icon: Compass, label: "Trip planner", copy: "Auto-built itineraries", kind: "all" as const },
];

const promises = [
  { icon: BadgeCheck, title: "Verified businesses only", copy: "Every partner is document-checked and approved before appearing publicly." },
  { icon: ShieldCheck, title: "Protected bookings", copy: "Clear cancellation policies, digital receipts and QR confirmations." },
  { icon: CalendarRange, title: "One dashboard", copy: "Tours, rooms and tables tracked in a single itinerary timeline." },
];

function Home() {
  const featured = useQuery({ queryKey: ["featured"], queryFn: fetchFeatured });
  const trending = useQuery({ queryKey: ["trending"], queryFn: () => fetchTrending() });
  const recent = useQuery({ queryKey: ["recent"], queryFn: fetchRecent });
  const dests = useQuery({ queryKey: ["destinations"], queryFn: fetchDestinations });

  return (
    <>
      <Hero />

      <div className="-mt-14 relative z-10">
        <SearchStrip />
      </div>

      {/* Categories */}
      <section className="section">
        <div className="container-x">
          <SectionHeading
            eyebrow="Browse by category"
            title="Everything a trip needs, in one place"
            description="Stop juggling four tabs and three confirmation emails. ExploreHub brings the entire trip under one roof."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((c) => (
              <Link
                key={c.label}
                to={c.kind === "all" ? "/planner" : "/explore"}
                search={c.kind === "all" ? undefined : { kind: c.kind }}
                className="hover-lift group rounded-3xl border border-border bg-card p-6 shadow-soft"
              >
                <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <c.icon className="size-6" />
                </span>
                <h3 className="mt-5 font-display text-lg font-semibold">{c.label}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{c.copy}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured */}
      <section className="section pt-0">
        <div className="container-x">
          <SectionHeading
            eyebrow="Editor's picks"
            title="Featured this month"
            description="Hand-selected by our destination editors — the listings guests rate highest right now."
            action={
              <Button asChild variant="outline" className="rounded-full">
                <Link to="/explore" search={{ kind: "all" }}>
                  View all <ArrowRight className="size-4" />
                </Link>
              </Button>
            }
          />
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.isLoading
              ? Array.from({ length: 3 }).map((_, i) => <ListingCardSkeleton key={i} />)
              : featured.data?.map((l, i) => <ListingCard key={l.id} listing={l} index={i} />)}
          </div>
        </div>
      </section>

      {/* Destinations */}
      <section className="section bg-secondary/50 pt-16">
        <div className="container-x">
          <SectionHeading
            eyebrow="Trending destinations"
            title="Where travellers are heading"
            description="Six regions seeing the fastest growth in bookings this season."
          />
          <DestinationGrid destinations={dests.data} isLoading={dests.isLoading} />
        </div>
      </section>

      {/* Promo banner */}
      <section className="section">
        <div className="container-x">
          <div className="relative overflow-hidden rounded-[2rem] bg-[image:var(--gradient-primary)] px-8 py-14 text-primary-foreground shadow-lift lg:px-16 lg:py-20">
            <div className="animate-float-slow pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-gold/25 blur-3xl" />
            <div className="relative max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full bg-background/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em]">
                <Sparkles className="size-3.5" /> Smart Trip Planner
              </span>
              <h2 className="mt-5 text-3xl font-semibold sm:text-4xl lg:text-5xl">
                Tell us your budget. We'll build the trip.
              </h2>
              <p className="mt-4 text-base leading-relaxed opacity-90">
                Enter a destination, dates, travellers and interests — the planner assembles a
                costed itinerary of tours, rooms and tables you can edit before you book.
              </p>
              <Button asChild variant="sand" size="xl" className="mt-8">
                <Link to="/planner">
                  Build my itinerary <ArrowRight className="size-4.5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Trending listings */}
      <section className="section pt-0">
        <div className="container-x">
          <SectionHeading
            eyebrow="Most booked"
            title="Trending right now"
            description="Ranked by bookings and review volume across the last 30 days."
          />
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {trending.isLoading
              ? Array.from({ length: 4 }).map((_, i) => <ListingCardSkeleton key={i} />)
              : trending.data?.slice(0, 4).map((l, i) => <ListingCard key={l.id} listing={l} index={i} />)}
          </div>
        </div>
      </section>

      {/* Why */}
      <section className="section bg-secondary/50">
        <div className="container-x grid gap-10 lg:grid-cols-3">
          {promises.map((p) => (
            <div key={p.title} className="flex gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                <p.icon className="size-5" />
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-lg font-semibold">{p.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{p.copy}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recently added */}
      <section className="section">
        <div className="container-x">
          <SectionHeading
            eyebrow="New on ExploreHub"
            title="Recently added businesses"
            description="Freshly verified partners who joined the marketplace this month."
          />
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {recent.isLoading
              ? Array.from({ length: 3 }).map((_, i) => <ListingCardSkeleton key={i} />)
              : recent.data?.slice(0, 3).map((l, i) => <ListingCard key={l.id} listing={l} index={i} />)}
          </div>
        </div>
      </section>

      <Testimonials />
    </>
  );
}
