import { StatusBadge } from "@/components/shared/status-badge";
import {
  bookingDurationLabel,
  bookingEndYmd,
  bookingStartYmd,
  formatDateTime,
  PACKAGE_BILLING_LABELS,
  PRICING_TYPE_LABELS,
  resolvePackageBilling,
} from "@/lib/booking-model";
import { bookingStatusLabel } from "@/lib/booking-receipt";
import type { Booking } from "@/lib/types";
import { peso } from "@/lib/utils";

export function BookingDetailsList({
  booking,
  compact = false,
}: {
  booking: Booking;
  compact?: boolean;
}) {
  const packageBilling = booking.packageSnapshot
    ? PACKAGE_BILLING_LABELS[resolvePackageBilling(booking.packageSnapshot)]
    : "";
  const pricing =
    booking.pricingType === "per_package" && packageBilling
      ? packageBilling
      : booking.pricingType
        ? PRICING_TYPE_LABELS[booking.pricingType]
        : "";
  const start = formatDateTime(bookingStartYmd(booking), booking.startTime) || booking.date;
  const end = formatDateTime(bookingEndYmd(booking), booking.endTime) || start;
  const rows: { label: string; value: string }[] = [
    {
      label:
        booking.kind === "stay"
          ? "Stay"
          : booking.kind === "restaurant"
            ? "Dining"
            : booking.kind === "package"
              ? "Package"
              : "Tour",
      value: booking.listingTitle,
    },
  ];
  if (booking.packageNameSnapshot) {
    rows.push({
      label: "Package tier",
      value:
        booking.packagePriceSnapshot != null
          ? `${booking.packageNameSnapshot} · ${peso(booking.packagePriceSnapshot)}${
              packageBilling ? ` ${packageBilling.toLowerCase()}` : ""
            }`
          : booking.packageNameSnapshot,
    });
  }
  rows.push(
    { label: "Start", value: start },
    { label: "End", value: end },
    { label: "Duration", value: bookingDurationLabel(booking) },
    { label: "Guests", value: String(booking.guests) },
  );
  if (pricing) rows.push({ label: "Billing", value: pricing });
  rows.push({ label: "Total", value: peso(booking.total) });

  return (
    <dl className={compact ? "space-y-1.5 text-sm" : "space-y-2 text-left text-sm"}>
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-4">
          <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
          <dd className="text-right font-medium">{row.value}</dd>
        </div>
      ))}
      <div className="flex items-center justify-between gap-4">
        <dt className="text-muted-foreground">Status</dt>
        <dd>
          <StatusBadge status={booking.status} />
        </dd>
      </div>
      {!compact ? (
        <p className="text-xs text-muted-foreground">{bookingStatusLabel(booking.status)}</p>
      ) : null}
      {booking.packageSnapshot?.inclusions?.length ? (
        <div className="pt-1">
          <dt className="text-muted-foreground">Inclusions at booking</dt>
          <dd className="mt-1 text-xs font-medium">{booking.packageSnapshot.inclusions.join(" · ")}</dd>
        </div>
      ) : null}
      {booking.packageSnapshot?.exclusions?.length ? (
        <div className="pt-1">
          <dt className="text-muted-foreground">Exclusions at booking</dt>
          <dd className="mt-1 text-xs font-medium">{booking.packageSnapshot.exclusions.join(" · ")}</dd>
        </div>
      ) : null}
    </dl>
  );
}
