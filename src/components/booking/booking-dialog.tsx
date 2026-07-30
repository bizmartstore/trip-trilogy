import { useMutation } from "@tanstack/react-query";
import { motion } from "motion/react";
import { CalendarDays, CheckCircle2, Download, Loader2, QrCode } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

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
import { Separator } from "@/components/ui/separator";
import { createBooking } from "@/lib/api";
import type { Booking, Listing } from "@/lib/types";

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your full name").max(80),
  email: z.string().trim().email("Enter a valid email address").max(160),
  phone: z.string().trim().min(6, "Enter a contact number").max(32),
  date: z.string().min(1, "Choose a date"),
  notes: z.string().max(400).optional(),
});

type FormValues = z.infer<typeof schema>;

export function BookingDialog({
  open,
  onOpenChange,
  listing,
  guests,
  total,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  listing: Listing;
  guests: number;
  total: number;
}) {
  const [confirmed, setConfirmed] = useState<Booking | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", phone: "", date: "", notes: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createBooking({
        listing,
        guests,
        date: values.date,
        total,
        customer: values.name,
      }),
    onSuccess: (booking) => {
      setConfirmed(booking);
      toast.success("Booking submitted", {
        description: `Reference ${booking.reference} — awaiting partner confirmation.`,
      });
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) {
      setTimeout(() => {
        setConfirmed(null);
        form.reset();
      }, 250);
    }
  };

  const countdown = confirmed
    ? Math.max(
        0,
        Math.ceil((new Date(confirmed.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      )
    : 0;

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
                Booking confirmed
              </DialogTitle>
              <DialogDescription className="text-center">
                We've emailed your digital confirmation and receipt.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 rounded-3xl border border-dashed border-border bg-secondary/40 p-6">
              <div className="mx-auto grid size-28 place-items-center rounded-2xl bg-card">
                <QrCode className="size-20" />
              </div>
              <p className="mt-4 font-mono text-lg font-semibold tracking-wider">
                {confirmed.reference}
              </p>
              <Separator className="my-4" />
              <dl className="space-y-2 text-left text-sm">
                <Row label="Listing" value={confirmed.listingTitle} />
                <Row label="Date" value={confirmed.date} />
                <Row label="Guests" value={String(confirmed.guests)} />
                <Row label="Total" value={peso(confirmed.total)} />
                <Row label="Payment" value={confirmed.paid ? "Paid" : "Pay on arrival"} />
                <Row label="Status" value="Pending partner approval" />
              </dl>
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
                onClick={() => toast.success("Receipt downloaded")}
              >
                <Download className="size-4" /> Receipt
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
                {listing.title} · {guests} {guests === 1 ? "guest" : "guests"} · {peso(total)} total
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
                className="mt-2 space-y-4"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full name</FormLabel>
                      <FormControl>
                        <Input placeholder="Amara Devi" className="h-11 rounded-xl" {...field} />
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
                          <Input placeholder="+65 9123 4567" className="h-11 rounded-xl" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preferred date</FormLabel>
                      <FormControl>
                        <Input type="date" className="h-11 rounded-xl" {...field} />
                      </FormControl>
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
                  disabled={mutation.isPending}
                >
                  {mutation.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Securing your spot…
                    </>
                  ) : (
                    <>
                      <CalendarDays className="size-4" /> Confirm booking · {peso(total)}
                    </>
                  )}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  {listing.cancellationPolicy}
                </p>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium">{value}</dd>
    </div>
  );
}
