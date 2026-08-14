import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { CalendarDays, CheckCircle2, MapPin, Phone, Users } from "lucide-react";

import { BookingQrCode } from "@/components/booking/booking-qr-code";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getBookingByReference } from "@/lib/store.server";
import { bookingStatusLabel } from "@/lib/booking-receipt";
import { NEXORA_LOGO_SRC } from "@/lib/brand";
import { peso } from "@/lib/utils";

export const Route = createFileRoute("/booking/$reference")({
  loader: async ({ params }) => {
    const booking = await getBookingByReference(params.reference);
    if (!booking) throw notFound();
    return { booking };
  },
  head: ({ loaderData }) => {
    const ref = loaderData?.booking.reference ?? "Booking";
    return {
      meta: [
        { title: `${ref} | Nexora reservation` },
        { name: "description", content: "Verified Nexora booking confirmation." },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="container-x pt-32 pb-24 text-center">
      <h1 className="text-2xl font-semibold">Booking not found</h1>
      <p className="mt-2 text-muted-foreground">
        This reference may be incorrect or the reservation was removed.
      </p>
      <Button asChild variant="outline" className="mt-6 rounded-full">
        <Link to="/explore" search={{ kind: "all" }}>
          Browse experiences
        </Link>
      </Button>
    </div>
  ),
  component: BookingConfirmationPage,
});

function BookingConfirmationPage() {
  const { booking } = Route.useLoaderData();

  return (
    <div className="pb-16 pt-28">
      <div className="container-x mx-auto max-w-lg">
        <div className="text-center">
          <img
            src={NEXORA_LOGO_SRC}
            alt="Nexora"
            className="mx-auto size-12 rounded-2xl object-contain"
          />
          <h1 className="mt-4 font-display text-2xl font-semibold">Reservation confirmation</h1>
          <p className="mt-1 text-sm text-muted-foreground">Verified Nexora booking</p>
        </div>

        <div className="mt-8 rounded-3xl border border-border bg-card p-6 shadow-soft">
          <div className="flex flex-col items-center">
            <BookingQrCode reference={booking.reference} size={128} className="rounded-xl" />
            <p className="mt-3 text-xs text-muted-foreground">
              Scan to verify this reservation — details stay in sync with admin updates.
            </p>
            <p className="mt-3 font-mono text-lg font-semibold tracking-wider">{booking.reference}</p>
          </div>

          <Separator className="my-5" />

          <dl className="space-y-3 text-sm">
            <Detail label="Listing" value={booking.listingTitle} />
            <Detail label="Guest" value={booking.customer} />
            <Detail label="Date" value={booking.date} icon={CalendarDays} />
            <Detail label="Guests" value={String(booking.guests)} icon={Users} />
            <Detail label="Total" value={peso(booking.total)} />
            <Detail
              label="Payment"
              value={booking.paid ? "Paid" : "Pay on arrival"}
            />
            <div className="flex items-center justify-between gap-4 pt-1">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <StatusBadge status={booking.status} />
              </dd>
            </div>
            <p className="text-xs text-muted-foreground">{bookingStatusLabel(booking.status)}</p>
          </dl>
        </div>

        <div className="mt-6 rounded-3xl border border-dashed border-border bg-secondary/40 p-5 text-sm text-muted-foreground">
          <p className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
            Present this reference when you arrive or when our team calls to confirm your reservation.
          </p>
          {booking.customerPhone ? (
            <p className="mt-3 flex items-center gap-2">
              <Phone className="size-4 shrink-0" />
              Contact on file: {booking.customerPhone}
            </p>
          ) : null}
          <p className="mt-3 flex items-center gap-2">
            <MapPin className="size-4 shrink-0" />
            Palawan, Philippines
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button asChild variant="hero" className="flex-1 rounded-full">
            <Link to="/auth">Sign in to manage trips</Link>
          </Button>
          <Button asChild variant="outline" className="flex-1 rounded-full">
            <Link to="/explore" search={{ kind: "all" }}>
              Book another
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: typeof CalendarDays;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
        {Icon ? <Icon className="size-3.5" /> : null}
        {label}
      </dt>
      <dd className="truncate text-right font-medium">{value}</dd>
    </div>
  );
}
