import { useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Booking } from "@/lib/types";
import { peso } from "@/lib/utils";

/** Only reservations the admin marked as paid count towards earnings. */
const EARNING: Booking["status"][] = ["partial_payment", "completed_payment", "completed"];

function bookingDay(b: Booking) {
  return (b.createdAt ?? b.date).slice(0, 10);
}

export function RevenuePanel({
  bookings,
  isMainAdmin = false,
  onResetRevenue,
}: {
  bookings: Booking[];
  isMainAdmin?: boolean;
  onResetRevenue?: (code: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [experience, setExperience] = useState("all");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [resetting, setResetting] = useState(false);

  const experiences = useMemo(
    () => Array.from(new Set(bookings.map((b) => b.listingTitle))).sort(),
    [bookings],
  );

  const filtered = useMemo(
    () =>
      bookings.filter((b) => {
        const day = bookingDay(b);
        if (from && day < from) return false;
        if (to && day > to) return false;
        if (experience !== "all" && b.listingTitle !== experience) return false;
        return true;
      }),
    [bookings, from, to, experience],
  );

  const stats = useMemo(() => {
    const earning = filtered.filter((b) => EARNING.includes(b.status));
    const gross = earning.reduce((sum, b) => sum + b.total, 0);
    const collected = earning
      .filter((b) => b.status === "completed_payment" || b.status === "completed")
      .reduce((s, b) => s + b.total, 0);
    const partial = earning
      .filter((b) => b.status === "partial_payment")
      .reduce((s, b) => s + b.total, 0);
    const awaitingPayment = filtered
      .filter((b) => ["approved", "confirmed"].includes(b.status))
      .reduce((s, b) => s + b.total, 0);
    const pending = filtered
      .filter((b) => b.status === "pending")
      .reduce((s, b) => s + b.total, 0);
    const rejected = filtered.filter((b) => b.status === "rejected").length;
    const avg = earning.length ? gross / earning.length : 0;

    const byMonth = new Map<string, number>();
    for (const b of earning) {
      const key = bookingDay(b).slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + b.total);
    }
    const series = [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, total]) => ({ month, total }));

    const byListing = new Map<string, { total: number; count: number }>();
    for (const b of earning) {
      const cur = byListing.get(b.listingTitle) ?? { total: 0, count: 0 };
      byListing.set(b.listingTitle, { total: cur.total + b.total, count: cur.count + 1 });
    }
    const top = [...byListing.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 6);

    const byPricing = new Map<string, { total: number; count: number }>();
    for (const b of earning) {
      const key = b.pricingType || "legacy";
      const cur = byPricing.get(key) ?? { total: 0, count: 0 };
      byPricing.set(key, { total: cur.total + b.total, count: cur.count + 1 });
    }

    const byPackage = new Map<string, { total: number; count: number }>();
    for (const b of earning) {
      if (!b.packageNameSnapshot) continue;
      const cur = byPackage.get(b.packageNameSnapshot) ?? { total: 0, count: 0 };
      byPackage.set(b.packageNameSnapshot, {
        total: cur.total + b.total,
        count: cur.count + 1,
      });
    }

    return {
      gross,
      collected,
      partial,
      awaitingPayment,
      pending,
      avg,
      series,
      top,
      byPricing: [...byPricing.entries()].sort((a, b) => b[1].total - a[1].total),
      byPackage: [...byPackage.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 6),
      count: earning.length,
      rejected,
    };
  }, [filtered]);

  const exportCsv = () => {
    const header = [
      "reference",
      "created_at",
      "start_date",
      "end_date",
      "duration_days",
      "duration_nights",
      "pricing_type",
      "package",
      "experience",
      "guest",
      "email",
      "phone",
      "guests",
      "status",
      "paid",
      "payment_method",
      "paid_at",
      "subtotal_php",
      "total_php",
      "approved_at",
      "rejected_at",
      "admin_note",
    ];
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = filtered.map((b) =>
      [
        b.reference,
        b.createdAt ?? "",
        b.startDate || b.date,
        b.endDate || b.startDate || b.date,
        b.durationDays ?? "",
        b.durationNights ?? "",
        b.pricingType ?? "",
        b.packageNameSnapshot ?? "",
        b.listingTitle,
        b.customer,
        b.customerEmail ?? "",
        b.customerPhone ?? "",
        b.guests,
        b.status,
        b.paid ? "yes" : "no",
        b.paymentMethod ?? "",
        b.paidAt ?? "",
        b.subtotal ?? b.total,
        b.total,
        b.approvedAt ?? "",
        b.rejectedAt ?? "",
        b.adminNote ?? "",
      ]
        .map(escape)
        .join(","),
    );
    const summary = [
      "",
      escape("SUMMARY") + ",".repeat(header.length - 1),
      [escape("Gross earnings"), escape(stats.gross)].join(","),
      [escape("Fully paid"), escape(stats.collected)].join(","),
      [escape("Partially paid"), escape(stats.partial)].join(","),
      [escape("Awaiting payment"), escape(stats.awaitingPayment)].join(","),
      [escape("Awaiting approval"), escape(stats.pending)].join(","),
      [escape("Bookings counted"), escape(stats.count)].join(","),
    ];
    const csv = [header.join(","), ...rows, ...summary].join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexora-earnings-${from || "all"}_${to || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setFrom("");
    setTo("");
    setExperience("all");
  };

  const submitReset = async () => {
    if (!onResetRevenue) return;
    setResetting(true);
    try {
      const result = await onResetRevenue(resetCode);
      if (!result.ok) {
        toast.error(result.error ?? "Reset failed");
        return;
      }
      toast.success("Revenue, live feed, and booking records have been cleared");
      setResetOpen(false);
      setResetCode("");
      clearFilters();
    } catch {
      toast.error("Could not reset revenue");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-3xl border border-border bg-secondary/30 p-5 md:grid-cols-[repeat(3,minmax(0,1fr))_auto] md:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="rev-from">From</Label>
          <Input
            id="rev-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rev-to">To</Label>
          <Input
            id="rev-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-1.5 min-w-0">
          <Label>Experience</Label>
          <Select value={experience} onValueChange={setExperience}>
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue placeholder="All experiences" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All experiences</SelectItem>
              {experiences.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          {(from || to || experience !== "all") && (
            <Button variant="ghost" className="rounded-full" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
          {isMainAdmin ? (
            <Button
              variant="destructive"
              className="rounded-full"
              onClick={() => setResetOpen(true)}
            >
              Reset
            </Button>
          ) : null}
          <Button variant="hero" className="rounded-full" onClick={exportCsv}>
            <Download className="size-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Total earnings"
          value={peso(stats.gross)}
          hint={`${stats.count} paid reservations`}
        />
        <Metric
          label="Fully paid"
          value={peso(stats.collected)}
          hint="Completed payment status"
        />
        <Metric
          label="Partially paid"
          value={peso(stats.partial)}
          hint="Balances still being settled"
        />
        <Metric
          label="Awaiting payment"
          value={peso(stats.awaitingPayment)}
          hint={`${peso(stats.pending)} potential (pending approval)`}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Average booking {peso(Math.round(stats.avg))} · Rejected: {stats.rejected}
      </p>

      <div className="rounded-3xl border border-border bg-secondary/30 p-5">
        <p className="text-sm font-semibold">Earnings over time</p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.series}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} width={70} />
              <Tooltip formatter={(v: number) => peso(v)} />
              <Area
                type="monotone"
                dataKey="total"
                stroke="hsl(var(--primary))"
                fill="url(#rev)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-3xl border border-border p-5">
        <p className="text-sm font-semibold">Top earning experiences</p>
        <ul className="mt-4 space-y-3">
          {stats.top.length ? (
            stats.top.map(([title, v]) => (
              <li key={title} className="flex items-center justify-between gap-4 text-sm">
                <span className="truncate">
                  {title}
                  <span className="ml-2 text-xs text-muted-foreground">{v.count} bookings</span>
                </span>
                <span className="shrink-0 font-semibold">{peso(v.total)}</span>
              </li>
            ))
          ) : (
            <li className="text-sm text-muted-foreground">
              No approved bookings match these filters.
            </li>
          )}
        </ul>
      </div>

      {(stats.byPricing.length > 0 || stats.byPackage.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {stats.byPricing.length ? (
            <div className="rounded-3xl border border-border p-5">
              <p className="text-sm font-semibold">By pricing type</p>
              <ul className="mt-4 space-y-3">
                {stats.byPricing.map(([type, v]) => (
                  <li key={type} className="flex items-center justify-between gap-4 text-sm">
                    <span className="capitalize">
                      {type.replace(/_/g, " ")}
                      <span className="ml-2 text-xs text-muted-foreground">{v.count}</span>
                    </span>
                    <span className="font-semibold">{peso(v.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {stats.byPackage.length ? (
            <div className="rounded-3xl border border-border p-5">
              <p className="text-sm font-semibold">By package tier</p>
              <ul className="mt-4 space-y-3">
                {stats.byPackage.map(([name, v]) => (
                  <li key={name} className="flex items-center justify-between gap-4 text-sm">
                    <span>
                      {name}
                      <span className="ml-2 text-xs text-muted-foreground">{v.count}</span>
                    </span>
                    <span className="font-semibold">{peso(v.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Reset revenue</DialogTitle>
            <DialogDescription>
              This permanently deletes all booking records, clears the live reservation feed, and
              resets revenue totals. Enter the reset code to continue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reset-code">Reset code</Label>
              <Input
                id="reset-code"
                type="password"
                autoComplete="off"
                className="h-11 rounded-xl"
                placeholder="Enter code"
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  setResetOpen(false);
                  setResetCode("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="rounded-full"
                disabled={!resetCode.trim() || resetting}
                onClick={() => void submitReset()}
              >
                {resetting ? <Loader2 className="size-4 animate-spin" /> : "Confirm reset"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
