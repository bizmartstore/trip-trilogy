import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  addDaysYmd,
  bookingDurationLabel,
  bookingEndYmd,
  bookingStartYmd,
  eachYmd,
  formatShortDate,
  weekStartMonday,
} from "@/lib/booking-model";
import type { Booking } from "@/lib/types";
import { cn, peso } from "@/lib/utils";

type CalendarView = "month" | "week" | "day";

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function monthStart(ymd: string) {
  return `${ymd.slice(0, 7)}-01`;
}

function monthLabel(ymd: string) {
  const [y, m] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, (m || 1) - 1, 1)),
  );
}

export function AdminBookingCalendar({
  bookings,
  onSelect,
}: {
  bookings: Booking[];
  onSelect: (booking: Booking) => void;
}) {
  const [view, setView] = useState<CalendarView>("month");
  const [cursor, setCursor] = useState(todayYmd());

  const days = useMemo(() => {
    if (view === "day") return [cursor];
    if (view === "week") {
      const start = weekStartMonday(cursor);
      return eachYmd(start, addDaysYmd(start, 6));
    }
    const start = monthStart(cursor);
    const gridStart = weekStartMonday(start);
    const [y, m] = start.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const gridEnd = addDaysYmd(weekStartMonday(last), 6);
    return eachYmd(gridStart, gridEnd);
  }, [view, cursor]);

  const shift = (dir: -1 | 1) => {
    if (view === "day") setCursor(addDaysYmd(cursor, dir));
    else if (view === "week") setCursor(addDaysYmd(cursor, dir * 7));
    else {
      const [y, m] = monthStart(cursor).split("-").map(Number);
      const next = new Date(Date.UTC(y, m - 1 + dir, 1)).toISOString().slice(0, 10);
      setCursor(next);
    }
  };

  const occupying = (ymd: string) =>
    bookings.filter((b) => {
      const start = bookingStartYmd(b);
      const end = bookingEndYmd(b);
      return start && ymd >= start && ymd <= end && b.status !== "cancelled" && b.status !== "rejected";
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Reservation calendar</h2>
          <p className="text-sm text-muted-foreground">
            Multi-day bookings span every reserved date. Same records as the Bookings tab.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["month", "week", "day"] as CalendarView[]).map((v) => (
            <Button
              key={v}
              size="sm"
              variant={view === v ? "hero" : "outline"}
              className="rounded-full capitalize"
              onClick={() => setView(v)}
            >
              {v}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button size="icon" variant="outline" className="rounded-full" onClick={() => shift(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <p className="text-sm font-semibold">
          {view === "month" ? monthLabel(cursor) : view === "week" ? `Week of ${formatShortDate(days[0])}` : formatShortDate(cursor)}
        </p>
        <Button size="icon" variant="outline" className="rounded-full" onClick={() => shift(1)}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {view === "day" ? (
        <div className="space-y-2">
          {occupying(cursor).length ? (
            occupying(cursor).map((b) => <CalendarBookingCard key={b.id} booking={b} onSelect={onSelect} />)
          ) : (
            <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              No reservations on this date.
            </p>
          )}
        </div>
      ) : (
        <div className={cn("grid gap-1", view === "week" ? "grid-cols-1 sm:grid-cols-7" : "grid-cols-7")}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <p key={d} className="hidden px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:block">
              {d}
            </p>
          ))}
          {days.map((ymd) => {
            const items = occupying(ymd);
            const inMonth = ymd.slice(0, 7) === cursor.slice(0, 7);
            return (
              <button
                key={ymd}
                type="button"
                onClick={() => {
                  setCursor(ymd);
                  setView("day");
                }}
                className={cn(
                  "min-h-24 rounded-xl border border-border p-1.5 text-left align-top",
                  !inMonth && view === "month" && "opacity-40",
                  ymd === todayYmd() && "border-primary bg-primary/5",
                )}
              >
                <p className="text-xs font-semibold">{Number(ymd.slice(8, 10))}</p>
                <div className="mt-1 space-y-1">
                  {items.slice(0, view === "week" ? 6 : 3).map((b) => (
                    <span
                      key={b.id}
                      className={cn(
                        "block truncate rounded-md px-1 py-0.5 text-[10px] font-medium",
                        b.status === "pending" && "bg-warning/20",
                        (b.status === "approved" || b.status === "confirmed") && "bg-success/20",
                        b.status === "completed" && "bg-secondary",
                      )}
                    >
                      {b.customer.split(" ")[0]} · {b.listingTitle}
                    </span>
                  ))}
                  {items.length > (view === "week" ? 6 : 3) ? (
                    <span className="text-[10px] text-muted-foreground">+{items.length - (view === "week" ? 6 : 3)} more</span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CalendarBookingCard({
  booking,
  onSelect,
}: {
  booking: Booking;
  onSelect: (booking: Booking) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(booking)}
      className="w-full rounded-2xl border border-border bg-card p-4 text-left"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{booking.listingTitle}</p>
          <p className="text-sm text-muted-foreground">{booking.customer}</p>
        </div>
        <StatusBadge status={booking.status} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {formatShortDate(bookingStartYmd(booking))} – {formatShortDate(bookingEndYmd(booking))} ·{" "}
        {bookingDurationLabel(booking)}
        {booking.packageNameSnapshot
          ? ` · ${booking.packageNameSnapshot}${
              booking.packagePriceSnapshot != null ? ` (${peso(booking.packagePriceSnapshot)})` : ""
            }`
          : ""}{" "}
        · {peso(booking.total)}
      </p>
    </button>
  );
}
