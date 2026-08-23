import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  CalendarDays,
  CheckCircle2,
  Download,
  ExternalLink,
  Heart,
  Loader2,
  LogIn,
  MessageSquare,
  Phone,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { BookingDetailsList } from "@/components/booking/booking-details";
import { BookingQrCode } from "@/components/booking/booking-qr-code";
import { PackagePicker } from "@/components/booking/package-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { createBooking, fetchSettings } from "@/lib/api";
import {
  activePackages,
  bookingStartYmd,
  formatDateTime,
  formatDurationLabel,
  listingUsesSchedule,
  PACKAGE_BILLING_LABELS,
  quoteBooking,
  resolvePackageBilling,
  resolvePricingType,
} from "@/lib/booking-model";
import {
  downloadBookingReceipt,
  generateBookingQrDataUrl,
} from "@/lib/booking-receipt";
import { bookingConfirmationPath } from "@/lib/booking-url";
import { cacheBookingConfirmation } from "@/lib/booking-cache";
import type { Booking, Listing } from "@/lib/types";
import { peso } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your full name").max(80),
  email: z.string().trim().email("Enter a valid email address").max(160),
  phone: z.string().trim().min(6, "Enter a contact number").max(32),
  notes: z.string().max(400).optional(),
  notifyPreference: z.enum(["call", "sms", "email", "any"]),
});

type FormValues = z.infer<typeof schema>;

export function BookingDialog({
  open,
  onOpenChange,
  listing,
  guests,
  startDate,
  total,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  listing: Listing;
  guests: number;
  startDate: string;
  total: number;
}) {
  const [confirmed, setConfirmed] = useState<Booking | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [packageId, setPackageId] = useState<string | undefined>();
  const { user, ready } = useAuth();
  const settings = useQuery({ queryKey: ["hub-settings"], queryFn: fetchSettings });

  const pricingType = resolvePricingType(listing);
  const needsPackage = pricingType === "per_package";
  const packages = useMemo(() => activePackages(listing), [listing]);
  const selectedPackage = packages.find((pkg) => pkg.id === packageId);
  const packageBilling = resolvePackageBilling(selectedPackage);
  const packageGuestCap = selectedPackage?.guestLimit;
  const guestsForQuote =
    packageGuestCap && guests > packageGuestCap ? packageGuestCap : guests;

  useEffect(() => {
    if (!open) return;
    setPackageId(undefined);
  }, [open, listing.id]);

  useEffect(() => {
    if (!packageId) return;
    if (!packages.some((pkg) => pkg.id === packageId)) setPackageId(undefined);
  }, [packages, packageId]);

  const quote = useMemo(() => {
    if (!startDate) return null;
    if (needsPackage && !packageId) return null;
    return quoteBooking(listing, {
      guests: guestsForQuote,
      startDate,
      packageId,
    });
  }, [listing, guestsForQuote, startDate, packageId, needsPackage]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      phone: "",
      notes: "",
      notifyPreference: "call",
    },
  });

  useEffect(() => {
    if (!user) return;
    form.reset({
      name: user.name,
      email: user.email,
      phone: form.getValues("phone"),
      notes: form.getValues("notes"),
      notifyPreference: form.getValues("notifyPreference"),
    });
  }, [user, form]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createBooking({
        listing,
        guests: guestsForQuote,
        date: startDate,
        packageId,
        total: quote?.total ?? total,
        customer: values.name,
        customerEmail: values.email,
        customerPhone: values.phone,
        notifyPreference: values.notifyPreference,
        guestCheckout: !user,
      }),
    onSuccess: (booking) => {
      cacheBookingConfirmation(booking);
      setConfirmed(booking);
      toast.success("Booking submitted", {
        description: `Reference ${booking.reference} — awaiting admin approval.`,
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Something went wrong. Please try again.";
      toast.error(message);
    },
  });

  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) {
      setTimeout(() => {
        setConfirmed(null);
        setPackageId(undefined);
        form.reset();
      }, 250);
    }
  };

  const handleReceiptDownload = async () => {
    if (!confirmed) return;
    setDownloading(true);
    try {
      const qrDataUrl = await generateBookingQrDataUrl(confirmed.reference);
      await downloadBookingReceipt(confirmed, {
        qrDataUrl,
        settings: settings.data,
      });
      toast.success("Receipt downloaded");
    } catch {
      toast.error("Could not generate receipt. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const tripStart = confirmed ? bookingStartYmd(confirmed) : startDate;
  const countdown = tripStart
    ? Math.max(
        0,
        Math.ceil(
          (Date.parse(`${tripStart}T00:00:00Z`) - Date.now()) / (1000 * 60 * 60 * 24),
        ),
      )
    : 0;

  const scheduleLabel = listingUsesSchedule(listing.kind)
    ? quote
      ? `${formatDateTime(quote.startDate, quote.startTime)} → ${formatDateTime(quote.endDate, quote.endTime)}`
      : startDate
    : startDate;

  const canSubmit =
    !!startDate &&
    (!needsPackage || (!!packageId && packages.length > 0 && !!quote?.packageId)) &&
    !!quote;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-lg">
        {confirmed ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="text-center"
          >
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 220, damping: 14 }}
              className="mx-auto grid size-16 place-items-center rounded-full bg-success/15 text-success"
            >
              <CheckCircle2 className="size-9" />
            </motion.span>
            <DialogHeader className="mt-5">
              <DialogTitle className="text-center font-display text-2xl">
                Reservation received
              </DialogTitle>
              <DialogDescription className="text-center">
                Save your reference below — our admin team reviews it and confirms by call or text.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 rounded-3xl border border-dashed border-border bg-secondary/40 p-6">
              <div className="mx-auto grid size-32 place-items-center rounded-2xl bg-card p-2">
                <BookingQrCode reference={confirmed.reference} size={112} className="rounded-lg" />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Scan this code to open your live reservation details — listing, dates, guests, total,
                and status.
              </p>
              <p className="mt-3 font-mono text-lg font-semibold tracking-wider">
                {confirmed.reference}
              </p>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="mt-2 h-8 rounded-full text-xs text-muted-foreground"
              >
                <Link to={bookingConfirmationPath(confirmed.reference)} target="_blank">
                  <ExternalLink className="size-3.5" /> Open confirmation page
                </Link>
              </Button>
              <Separator className="my-4" />
              <BookingDetailsList booking={confirmed} />
              <div className="mt-3 flex justify-between gap-4 text-sm">
                <span className="text-muted-foreground">Payment</span>
                <span className="font-medium">{confirmed.paid ? "Paid" : "Pay on arrival"}</span>
              </div>
            </div>

            {!user && ready ? (
              <div className="mt-4 overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 text-left shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
                    <Sparkles className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Get the full Nexora experience — free</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Sign in or create an account to unlock everything travellers love about Nexora.
                    </p>
                  </div>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 shrink-0 text-primary" />
                    Track this booking and approval updates live
                  </li>
                  <li className="flex items-center gap-2">
                    <Heart className="size-4 shrink-0 text-primary" />
                    Save favourite tours, stays, and restaurants
                  </li>
                  <li className="flex items-center gap-2">
                    <CalendarDays className="size-4 shrink-0 text-primary" />
                    Manage all your Palawan trips in one dashboard
                  </li>
                </ul>
                <Button asChild variant="hero" className="mt-5 w-full rounded-full">
                  <Link to="/auth">
                    <LogIn className="size-4" /> Sign in or create free account
                  </Link>
                </Button>
              </div>
            ) : user ? (
              <div className="mt-4 rounded-3xl border border-border bg-card p-4 text-left text-sm">
                <p className="font-semibold">You&apos;re signed in</p>
                <p className="mt-1 text-muted-foreground">
                  View and manage this reservation anytime from your dashboard.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3 rounded-full">
                  <Link to="/dashboard">Open my dashboard</Link>
                </Button>
              </div>
            ) : null}

            <div className="mt-4 rounded-3xl border border-border bg-card p-5 text-left">
              <p className="text-sm font-semibold">What happens next</p>
              <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>
                  1. Your reservation is now{" "}
                  <strong className="text-foreground">pending admin approval</strong>.
                </li>
                <li>
                  2. Our team will <strong className="text-foreground">call or send you a text message</strong>{" "}
                  to confirm availability and payment — we do not send email confirmations.
                </li>
                <li>3. Keep your reference handy when you follow up or arrive on the day.</li>
              </ol>
              {settings.data?.bookingNotice ? (
                <p className="mt-3 text-sm text-muted-foreground">{settings.data.bookingNotice}</p>
              ) : null}
              <Separator className="my-4" />
              <p className="text-sm font-semibold">Need to follow up?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {settings.data?.officeHours ?? "Daily · 7:00 AM – 9:00 PM (PHT)"}
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                {settings.data?.contactPhone ? (
                  <Button asChild variant="outline" className="flex-1 rounded-full">
                    <a href={`tel:${settings.data.contactPhone.replace(/[^+\d]/g, "")}`}>
                      <Phone className="size-4" /> Call {settings.data.contactPhone}
                    </a>
                  </Button>
                ) : null}
                {settings.data?.contactMobile ? (
                  <Button asChild variant="outline" className="flex-1 rounded-full">
                    <a
                      href={`sms:${settings.data.contactMobile.replace(/[^+\d]/g, "")}?&body=${encodeURIComponent(
                        `Hi Nexora, following up on booking ${confirmed.reference}.`,
                      )}`}
                    >
                      <MessageSquare className="size-4" /> Text admin
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>

            {countdown > 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                <strong className="text-foreground">{countdown} days</strong> until your trip begins
              </p>
            ) : null}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="flex-1 rounded-full"
                disabled={downloading}
                onClick={() => void handleReceiptDownload()}
              >
                {downloading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Download receipt
              </Button>
              <Button variant="hero" className="flex-1 rounded-full" onClick={() => close(false)}>
                Done
              </Button>
            </div>
          </motion.div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-xl">Complete your booking</DialogTitle>
              <DialogDescription>
                {listing.title} · {guestsForQuote} {guestsForQuote === 1 ? "guest" : "guests"}
                {quote ? ` · ${peso(quote.total)} total` : needsPackage ? " · choose a package" : ""}
              </DialogDescription>
            </DialogHeader>

            {needsPackage ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Choose a package tier</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Review inclusions, duration, and billing for each tier before confirming.
                  </p>
                </div>
                <PackagePicker
                  packages={packages}
                  selectedId={packageId}
                  onSelect={(pkg) => setPackageId(pkg.id)}
                />
              </div>
            ) : null}

            <div className="rounded-2xl border border-border bg-secondary/40 p-4 text-sm">
              {quote?.packageName ? (
                <p>
                  <span className="text-muted-foreground">Package:</span>{" "}
                  <strong>{quote.packageName}</strong>
                  {quote.packagePrice != null
                    ? ` · ${peso(quote.packagePrice)} ${PACKAGE_BILLING_LABELS[packageBilling].toLowerCase()}`
                    : ""}
                </p>
              ) : null}
              <p className={quote?.packageName ? "mt-1" : undefined}>
                <span className="text-muted-foreground">Start:</span>{" "}
                <strong>
                  {quote
                    ? formatDateTime(quote.startDate, quote.startTime)
                    : startDate}
                </strong>
              </p>
              {quote && listingUsesSchedule(listing.kind) ? (
                <>
                  <p className="mt-1">
                    <span className="text-muted-foreground">End:</span>{" "}
                    <strong>{formatDateTime(quote.endDate, quote.endTime)}</strong>
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {formatDurationLabel(quote.durationDays, quote.durationNights)}
                  </p>
                </>
              ) : needsPackage && !packageId ? (
                <p className="mt-1 text-muted-foreground">
                  End date and duration unlock after you select a package tier.
                </p>
              ) : (
                <p className={quote?.packageName ? "mt-1" : undefined}>
                  <span className="text-muted-foreground">
                    {listingUsesSchedule(listing.kind) ? "Schedule:" : "Date:"}
                  </span>{" "}
                  <strong>{scheduleLabel}</strong>
                </p>
              )}
              {quote ? (
                <p className="mt-2 flex justify-between border-t border-border/60 pt-2 font-medium">
                  <span className="text-muted-foreground">Total</span>
                  <span>{peso(quote.total)}</span>
                </p>
              ) : null}
            </div>

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((v) => {
                  if (needsPackage && !packageId) {
                    toast.error("Please select a package tier.");
                    return;
                  }
                  if (packageGuestCap && guests > packageGuestCap) {
                    toast.error(`This package is limited to ${packageGuestCap} guests.`);
                    return;
                  }
                  mutation.mutate(v);
                })}
                className="mt-2 space-y-4"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full name</FormLabel>
                      <FormControl>
                        <Input placeholder="Your full name" className="h-11 rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="you@example.com" className="h-11 rounded-xl" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input placeholder="+63 917 000 0000" className="h-11 rounded-xl" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="notifyPreference"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>How should we reach you?</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="h-11 rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="call">Phone call (fastest)</SelectItem>
                          <SelectItem value="sms">Text / SMS message</SelectItem>
                          <SelectItem value="email">Email when available</SelectItem>
                          <SelectItem value="any">Any channel is fine</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Email delivery is not guaranteed — our admin team confirms every booking by
                        call or text on the number above.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Special requests (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Dietary needs, arrival time…" className="h-11 rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  variant="hero"
                  size="lg"
                  className="w-full rounded-full"
                  disabled={mutation.isPending || !canSubmit}
                >
                  {mutation.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Securing your spot…
                    </>
                  ) : (
                    <>
                      <CalendarDays className="size-4" /> Confirm booking
                      {quote ? ` · ${peso(quote.total)}` : ""}
                    </>
                  )}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  {settings.data?.cancellationNotice?.trim() || listing.cancellationPolicy}
                </p>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
