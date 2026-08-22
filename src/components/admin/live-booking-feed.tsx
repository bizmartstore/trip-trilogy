import { useQuery } from "@tanstack/react-query";
import { Radio } from "lucide-react";

import { StatusBadge } from "@/components/shared/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { fetchBookingFeed } from "@/lib/api";
import { bookingDateRangeLabel, bookingDurationLabel } from "@/lib/booking-model";
import type { Booking, BookingStatus } from "@/lib/types";
import { peso } from "@/lib/utils";

function timeAgo(iso: string) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Live reservation feed — polls for new reservations every few seconds. */
export function LiveBookingFeed() {
  const feed = useQuery({
    queryKey: ["booking-feed"],
    queryFn: fetchBookingFeed,
    refetchInterval: 4000,
    refetchIntervalInBackground: true,
  });

  return (
    <div className="rounded-3xl border border-border bg-secondary/30 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Radio className="size-4 animate-pulse text-success" /> Live reservation feed
        </p>
        <Badge className="rounded-full border-0 bg-success/15 text-success">
          {feed.data?.bookings.length ? "Live" : "Listening"}
        </Badge>
      </div>

      <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
        {feed.isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))
        ) : feed.data?.bookings.length ? (
          feed.data.bookings.map((b) => (
            <div
              key={b.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {b.customer} · <span className="font-mono text-xs">{b.reference}</span>
                  {(b as Booking).guestCheckout ? (
                    <span className="ml-2 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-primary">
                      Guest
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {b.listingTitle} · {b.guests} guest{b.guests === 1 ? "" : "s"}
                  {b.packageNameSnapshot ? ` · ${b.packageNameSnapshot}` : ""}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {bookingDateRangeLabel(b as Booking)}
                  {" · "}
                  {bookingDurationLabel(b as Booking)}
                </p>
                {b.customerPhone ? (
                  <p className="truncate text-xs text-muted-foreground">{b.customerPhone}</p>
                ) : null}
                {b.adminNote ? (
                  <p className="truncate text-xs italic text-muted-foreground">“{b.adminNote}”</p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <StatusBadge status={b.status as BookingStatus} />
                <p className="mt-1 text-xs font-semibold">{peso(b.total)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {timeAgo(b.statusUpdatedAt || b.createdAt)}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No reservations yet — new bookings appear here within seconds.
          </p>
        )}
      </div>
    </div>
  );
}
