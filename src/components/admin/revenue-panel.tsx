import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { Booking } from "@/lib/types";
import { peso } from "@/lib/utils";

const EARNING: Booking["status"][] = ["approved", "confirmed", "completed"];

export function RevenuePanel({ bookings }: { bookings: Booking[] }) {
  const stats = useMemo(() => {
    const earning = bookings.filter((b) => EARNING.includes(b.status));
    const gross = earning.reduce((sum, b) => sum + b.total, 0);
    const collected = earning.filter((b) => b.paid).reduce((s, b) => s + b.total, 0);
    const pending = bookings
      .filter((b) => b.status === "pending")
      .reduce((s, b) => s + b.total, 0);
    const avg = earning.length ? gross / earning.length : 0;

    const byMonth = new Map<string, number>();
    for (const b of earning) {
      const key = (b.createdAt ?? b.date).slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + b.total);
    }
    const series = [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([month, total]) => ({ month, total }));

    const byListing = new Map<string, number>();
    for (const b of earning) {
      byListing.set(b.listingTitle, (byListing.get(b.listingTitle) ?? 0) + b.total);
    }
    const top = [...byListing.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return { gross, collected, pending, avg, series, top, count: earning.length };
  }, [bookings]);

  return (
    <div className="space-y-6">
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
            stats.top.map(([title, total]) => (
              <li key={title} className="flex items-center justify-between gap-4 text-sm">
                <span className="truncate">{title}</span>
                <span className="shrink-0 font-semibold">{peso(total)}</span>
              </li>
            ))
          ) : (
            <li className="text-sm text-muted-foreground">No approved bookings yet.</li>
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
