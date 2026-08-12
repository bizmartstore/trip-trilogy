import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
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

const EARNING: Booking["status"][] = ["approved", "confirmed", "completed"];

function bookingDay(b: Booking) {
  return (b.createdAt ?? b.date).slice(0, 10);
}

export function RevenuePanel({ bookings }: { bookings: Booking[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [experience, setExperience] = useState("all");

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
    const collected = earning.filter((b) => b.paid).reduce((s, b) => s + b.total, 0);
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

    return { gross, collected, pending, avg, series, top, count: earning.length, rejected };
  }, [filtered]);

  const exportCsv = () => {
    const header = [
      "reference",
      "created_at",
      "travel_date",
      "experience",
      "guest",
      "email",
      "phone",
      "guests",
      "status",
      "paid",
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
        b.date,
        b.listingTitle,
        b.customer,
        b.customerEmail ?? "",
        b.customerPhone ?? "",
        b.guests,
        b.status,
        b.paid ? "yes" : "no",
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
      [escape("Collected"), escape(stats.collected)].join(","),
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

  const reset = () => {
    setFrom("");
    setTo("");
    setExperience("all");
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
        <div className="flex gap-2">
          <Button variant="ghost" className="rounded-full" onClick={reset}>
            Reset
          </Button>
          <Button variant="hero" className="rounded-full" onClick={exportCsv}>
            <Download className="size-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total earnings" value={peso(stats.gross)} hint={`${stats.count} approved bookings`} />
        <Metric label="Collected" value={peso(stats.collected)} hint="Marked as paid" />
        <Metric label="Awaiting approval" value={peso(stats.pending)} hint="Potential revenue" />
        <Metric label="Average booking" value={peso(Math.round(stats.avg))} hint="Per reservation" />
      </div>

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
