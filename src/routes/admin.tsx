import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Building2, CheckCircle2, DollarSign, ShieldCheck, Users, XCircle } from "lucide-react";
import { toast } from "sonner";

import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchBookings, fetchPendingBusinesses, updateBookingStatus } from "@/lib/api";
import type { Booking, Listing } from "@/lib/types";
import { peso } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Console — Approvals & Revenue | ExploreHub" },
      {
        name: "description",
        content:
          "Approve business listings, moderate bookings and track marketplace revenue, categories and growth across the ExploreHub network.",
      },
      { property: "og:title", content: "Admin Console | ExploreHub" },
      { property: "og:description", content: "Approvals, moderation and revenue analytics for the ExploreHub marketplace." },
    ],
  }),
  component: Admin,
});

const revenueData = [
  { month: "Feb", revenue: 42000, bookings: 210 },
  { month: "Mar", revenue: 51500, bookings: 268 },
  { month: "Apr", revenue: 47800, bookings: 244 },
  { month: "May", revenue: 68200, bookings: 331 },
  { month: "Jun", revenue: 74900, bookings: 372 },
  { month: "Jul", revenue: 91300, bookings: 448 },
];

const mixData = [
  { name: "Tours", value: 42, color: "var(--color-primary)" },
  { name: "Stays", value: 34, color: "var(--color-accent)" },
  { name: "Dining", value: 24, color: "var(--color-warning)" },
];

function Admin() {
  const qc = useQueryClient();
  const pending = useQuery({ queryKey: ["pending-businesses"], queryFn: fetchPendingBusinesses });
  const bookings = useQuery({ queryKey: ["bookings"], queryFn: fetchBookings });

  const moderate = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "confirmed" | "rejected" }) =>
      updateBookingStatus(id, status),
    onSuccess: ({ id, status }) => {
      qc.setQueryData<Booking[]>(["bookings"], (old) =>
        old?.map((b) => (b.id === id ? { ...b, status } : b)),
      );
      toast.success(`Booking ${status}`);
    },
  });

  const approve = useMutation({
    mutationFn: async ({ id }: { id: string; approved: boolean }) => id,
    onSuccess: (id, vars) => {
      qc.setQueryData<Listing[]>(["pending-businesses"], (old) => old?.filter((l) => l.id !== id));
      toast.success(vars.approved ? "Business approved" : "Application rejected");
    },
  });

  return (
    <div className="pt-28">
      <div className="container-x">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <ShieldCheck className="size-3.5" /> Administrator
            </span>
            <h1 className="mt-4 truncate text-3xl font-semibold sm:text-4xl">Marketplace console</h1>
          </div>
          <Badge className="shrink-0 rounded-full border-0 bg-success/15 text-success">
            All systems healthy
          </Badge>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={DollarSign} label="Revenue this month" value="₱5.1M" delta="+22%" index={0} />
          <StatCard icon={Users} label="Active tourists" value="12,480" delta="+8.4%" index={1} />
          <StatCard icon={Building2} label="Partner businesses" value="642" delta="+31" index={2} />
          <StatCard icon={CheckCircle2} label="Pending approvals" value={String(pending.data?.length ?? 0)} delta="-4" index={3} />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
            <h2 className="font-display text-lg font-semibold">Revenue & booking volume</h2>
            <div className="mt-6 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: "var(--color-muted)" }}
                    contentStyle={{
                      borderRadius: "1rem",
                      border: "1px solid var(--color-border)",
                      background: "var(--color-card)",
                      color: "var(--color-card-foreground)",
                    }}
                  />
                  <Bar dataKey="revenue" fill="var(--color-primary)" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
            <h2 className="font-display text-lg font-semibold">Category mix</h2>
            <div className="mt-2 h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={mixData} dataKey="value" innerRadius={54} outerRadius={82} paddingAngle={4} strokeWidth={0}>
                    {mixData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: "1rem",
                      border: "1px solid var(--color-border)",
                      background: "var(--color-card)",
                      color: "var(--color-card-foreground)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-4 space-y-2">
              {mixData.map((d) => (
                <li key={d.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ background: d.color }} />
                    {d.name}
                  </span>
                  <span className="font-medium">{d.value}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-border bg-card p-6 shadow-soft">
          <Tabs defaultValue="businesses">
            <TabsList className="rounded-full">
              <TabsTrigger value="businesses" className="rounded-full">Business approvals</TabsTrigger>
              <TabsTrigger value="bookings" className="rounded-full">Booking moderation</TabsTrigger>
            </TabsList>

            <TabsContent value="businesses" className="mt-6 space-y-4">
              {pending.isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full rounded-2xl" />
                  ))
                : null}
              {pending.data?.map((l) => (
                <div
                  key={l.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-2xl border border-border p-4 sm:flex sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <img src={l.images[0]} alt="" loading="lazy" className="size-14 shrink-0 rounded-xl object-cover" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{l.businessName}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {l.category} · {l.destination}, {l.country}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => approve.mutate({ id: l.id, approved: false })}
                    >
                      <XCircle className="size-4" /> Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="hero"
                      className="rounded-full"
                      onClick={() => approve.mutate({ id: l.id, approved: true })}
                    >
                      <CheckCircle2 className="size-4" /> Approve
                    </Button>
                  </div>
                </div>
              ))}
              {pending.data?.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No applications waiting for review.
                </p>
              ) : null}
            </TabsContent>

            <TabsContent value="bookings" className="mt-6 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Guest</TableHead>
                    <TableHead>Listing</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Moderate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookings.data?.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs">{b.reference}</TableCell>
                      <TableCell className="whitespace-nowrap">{b.customer}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{b.listingTitle}</TableCell>
                      <TableCell>{peso(b.total)}</TableCell>
                      <TableCell><StatusBadge status={b.status} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-full"
                            onClick={() => moderate.mutate({ id: b.id, status: "rejected" })}
                          >
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-full"
                            onClick={() => moderate.mutate({ id: b.id, status: "confirmed" })}
                          >
                            Confirm
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </div>

        <div className="mt-8 rounded-3xl border border-border bg-card p-6 shadow-soft">
          <h2 className="font-display text-lg font-semibold">Booking growth</h2>
          <div className="mt-6 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: "1rem",
                    border: "1px solid var(--color-border)",
                    background: "var(--color-card)",
                    color: "var(--color-card-foreground)",
                  }}
                />
                <Line type="monotone" dataKey="bookings" stroke="var(--color-primary)" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
