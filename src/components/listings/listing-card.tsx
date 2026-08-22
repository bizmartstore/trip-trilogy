import { Link, useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Clock, Heart, MapPin, Users } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { RatingBadge } from "@/components/listings/rating-badge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchFavorites, toggleFavorite } from "@/lib/api";
import { listingDurationLabel } from "@/lib/booking-model";
import { isListingAvailable, type Listing } from "@/lib/types";
import { cn, peso } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

const kindLabel: Record<Listing["kind"], string> = {
  tour: "Tour",
  stay: "Stay",
  restaurant: "Dining",
  package: "Package",
};

export function ListingCard({ listing, index = 0 }: { listing: Listing; index?: number }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const available = isListingAvailable(listing);
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
    onError: () => toast.error("Could not update favourites"),
  });

  const packagePrices = (listing.packages ?? [])
    .filter((p) => p.active !== false)
    .map((p) => p.price)
    .filter((n) => Number.isFinite(n) && n >= 0);
  const packageFrom =
    (listing.kind === "package" || listing.pricingType === "per_package") && packagePrices.length
      ? Math.min(...packagePrices)
      : null;
  const basePrice = packageFrom ?? listing.price;
  const discounted = listing.discountPct
    ? Math.round(basePrice * (1 - listing.discountPct / 100))
    : basePrice;
  const showFrom = packageFrom != null;

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay: Math.min(index * 0.06, 0.4), ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "hover-lift group relative overflow-hidden rounded-3xl border border-border bg-card shadow-soft",
        !available && "hover-lift:transform-none opacity-95",
      )}
      aria-disabled={!available}
    >
      {available ? (
        <Link
          to="/listing/$slug"
          params={{ slug: listing.slug }}
          className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ListingCardMedia listing={listing} available />
        </Link>
      ) : (
        <div className="block cursor-not-allowed">
          <ListingCardMedia listing={listing} available={false} />
        </div>
      )}

      <button
        type="button"
        aria-label={saved ? "Remove from favourites" : "Save to favourites"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!user) {
            void navigate({ to: "/auth" });
            return;
          }
          save.mutate();
        }}
        className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-card/85 backdrop-blur transition-transform hover:scale-110"
      >
        <Heart className={cn("size-4.5", saved ? "fill-destructive text-destructive" : "text-foreground")} />
      </button>

      <div className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          {available ? (
            <Link to="/listing/$slug" params={{ slug: listing.slug }} className="min-w-0">
              <h3 className="truncate font-display text-lg font-semibold">{listing.title}</h3>
            </Link>
          ) : (
            <h3 className="min-w-0 truncate font-display text-lg font-semibold text-muted-foreground">
              {listing.title}
            </h3>
          )}
          <RatingBadge rating={listing.rating} reviewCount={listing.reviewCount} />
        </div>

        <p className="line-clamp-2 text-sm text-muted-foreground">{listing.tagline}</p>

        {!available ? (
          <p className="rounded-2xl bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
            Not available
            {listing.unavailableReason ? ` — ${listing.unavailableReason}` : ""}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {listingDurationLabel(listing) || listing.durationDays || listing.durationNights != null ? (
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" />
              {listingDurationLabel(listing) ||
                `${listing.durationDays} ${listing.durationDays === 1 ? "day" : "days"}`}
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
              <span className="mr-2 text-sm text-muted-foreground line-through">{peso(listing.price)}</span>
            ) : null}
            <span className="font-display text-xl font-semibold">
              {showFrom ? `from ${peso(discounted)}` : peso(discounted)}
            </span>
            <span className="ml-1 text-xs text-muted-foreground">
              {showFrom ? "per package" : listing.unit}
            </span>
          </div>
          {available ? (
            <Link
              to="/listing/$slug"
              params={{ slug: listing.slug }}
              className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              View details
            </Link>
          ) : (
            <span className="text-sm font-semibold text-muted-foreground">Unavailable</span>
          )}
        </div>
      </div>
    </motion.article>
  );
}

function ListingCardMedia({ listing, available }: { listing: Listing; available: boolean }) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden">
      <img
        src={listing.images[0]}
        alt={listing.title}
        loading="lazy"
        width={1200}
        height={900}
        className={cn(
          "size-full object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          available ? "group-hover:scale-110" : "grayscale-[35%]",
        )}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-deep/70 via-deep/5 to-transparent opacity-80" />
      {!available ? <div className="absolute inset-0 bg-deep/35" /> : null}

      <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
        <Badge className="rounded-full border-0 bg-card/90 text-foreground backdrop-blur">
          {kindLabel[listing.kind]}
        </Badge>
        {!available ? (
          <Badge className="rounded-full border-0 bg-destructive text-destructive-foreground">
            Not available
          </Badge>
        ) : listing.discountPct ? (
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
