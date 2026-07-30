import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Clock, Heart, MapPin, Star, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/utils";

const kindLabel: Record<Listing["kind"], string> = {
  tour: "Tour",
  stay: "Stay",
  restaurant: "Dining",
};

export function ListingCard({ listing, index = 0 }: { listing: Listing; index?: number }) {
  const [saved, setSaved] = useState(false);
  const discounted = listing.discountPct
    ? Math.round(listing.price * (1 - listing.discountPct / 100))
    : listing.price;

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay: Math.min(index * 0.06, 0.4), ease: [0.22, 1, 0.36, 1] }}
      className="hover-lift group relative overflow-hidden rounded-3xl border border-border bg-card shadow-soft"
    >
      <Link
        to="/listing/$slug"
        params={{ slug: listing.slug }}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative aspect-[4/3] overflow-hidden">
          <img
            src={listing.images[0]}
            alt={listing.title}
            loading="lazy"
            width={1200}
            height={900}
            className="size-full object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-deep/70 via-deep/5 to-transparent opacity-80" />

          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            <Badge className="rounded-full border-0 bg-card/90 text-foreground backdrop-blur">
              {kindLabel[listing.kind]}
            </Badge>
            {listing.discountPct ? (
              <Badge className="rounded-full border-0 bg-gold text-gold-foreground">
                -{listing.discountPct}%
              </Badge>
            ) : null}
          </div>

          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 text-sm font-medium text-deep-foreground">
            <MapPin className="size-3.5" />
            {listing.destination}, {listing.country}
          </div>
        </div>
      </Link>

      <button
        type="button"
        aria-label={saved ? "Remove from favourites" : "Save to favourites"}
        onClick={() => {
          setSaved((s) => !s);
          toast.success(saved ? "Removed from favourites" : "Saved to favourites");
        }}
        className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-card/85 backdrop-blur transition-transform hover:scale-110"
      >
        <Heart className={cn("size-4.5", saved ? "fill-destructive text-destructive" : "text-foreground")} />
      </button>

      <div className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <Link to="/listing/$slug" params={{ slug: listing.slug }} className="min-w-0">
            <h3 className="truncate font-display text-lg font-semibold">{listing.title}</h3>
          </Link>
          <span className="flex shrink-0 items-center gap-1 text-sm font-semibold">
            <Star className="size-4 fill-gold text-gold" />
            {listing.rating}
            <span className="font-normal text-muted-foreground">({listing.reviewCount})</span>
          </span>
        </div>

        <p className="line-clamp-2 text-sm text-muted-foreground">{listing.tagline}</p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {listing.durationDays ? (
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" />
              {listing.durationDays} {listing.durationDays === 1 ? "day" : "days"}
            </span>
          ) : null}
          {listing.seatsLeft ? (
            <span className="flex items-center gap-1 text-warning-foreground">
              <Users className="size-3.5" />
              {listing.seatsLeft} left
            </span>
          ) : null}
          <span className="truncate">{listing.category}</span>
        </div>

        <div className="flex items-end justify-between border-t border-border pt-3">
          <div>
            {listing.discountPct ? (
              <span className="mr-2 text-sm text-muted-foreground line-through">${listing.price}</span>
            ) : null}
            <span className="font-display text-xl font-semibold">${discounted}</span>
            <span className="ml-1 text-xs text-muted-foreground">{listing.unit}</span>
          </div>
          <Link
            to="/listing/$slug"
            params={{ slug: listing.slug }}
            className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            View details
          </Link>
        </div>
      </div>
    </motion.article>
  );
}

export function ListingCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-3 p-5">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-8 w-full" />
      </div>
    </div>
  );
}
