import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function RatingBadge({
  rating,
  reviewCount,
  className,
}: {
  rating: number;
  reviewCount: number;
  className?: string;
}) {
  if (!reviewCount) {
    return (
      <span className={cn("text-xs font-medium text-muted-foreground", className)}>New</span>
    );
  }

  return (
    <span className={cn("flex shrink-0 items-center gap-1 text-sm font-semibold", className)}>
      <Star className="size-4 fill-gold text-gold" />
      {rating}
      <span className="font-normal text-muted-foreground">({reviewCount})</span>
    </span>
  );
}
