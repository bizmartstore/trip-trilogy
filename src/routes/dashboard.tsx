import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Bell, CalendarCheck, Heart, Loader2, Plane, Wallet } from "lucide-react";
import { toast } from "sonner";

import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
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
import { fetchBookings, updateBookingStatus } from "@/lib/api";
import type { Booking } from "@/lib/types";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "My Trips Dashboard | ExploreHub" },
      {
        name: "description",
        content:
          "Track every tour, stay and restaurant reservation in one place — statuses, spend, upcoming trips and notifications.",
      },
      { property: "og:title", content: "My Trips Dashboard | ExploreHub" },
      { property: "og:description", content: "Manage all your ExploreHub bookings in one dashboard." },
    ],
  }),
  component: Dashboard,
});

const spendData = [
  { month: "Feb", spend: 420 },
  { month: "Mar", spend: 980 },
  { month: "Apr", spend: 640 },
  { month: "May", spend: 1520 },
  { month: "Jun", spend: 990 },
  { month: "Jul", spend: 1830 },
];

const typeData = [
  { type: "Tours", count: 9 },
  { type: "Stays", count: 6 },
  { type: "Dining", count: 12 },
];

const notifications = [
  { title: "Booking confirmed", body: "Kyoto Temple Trail — your partner approved EXH-4821-KYO.", time: "2h ago" },
  { title: "Trip countdown", body: "45 days until your Amankila stay. Time to plan transfers.", time: "1d ago" },
  { title: "Promotional offer", body: "20% off Caldera Catamaran Sunset this week only.", time: "3d ago" },
];

function Dashboard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["bookings"], queryFn: fetchBookings });

  const cancel = useMutation({
    mutationFn: (id: string) => updateBookingStatus(id, "cancelled"),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["bookings"] });
      const prev = qc.getQueryData<Booking[]>(["bookings"]);
      qc.setQueryData<Booking[]>(["bookings"], (old) =>
        old?.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b)),
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      qc.setQueryData(["bookings"], ctx?.prev);
      toast.error("Could not cancel that booking");
    },
    onSuccess: () => toast.success("Booking cancelled", { description: "A refund confirmation is on its way." }),
  });

  const upcoming = data?.filter((b) => ["pending", "approved", "confirmed"].includes(b.status)) ?? [];
  const totalSpend = data?.reduce((s, b) => s + (b.status === "cancelled" ? 0 : b.total), 0) ?? 0;

  return (
    <div className="pt-28">
      <div className="container-x">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-semibold sm:text-4xl">Welcome back, Amara</h1>
            <p className="mt-2 text-muted-foreground">
              Everything you've booked across ExploreHub, in one timeline.
            </p>
          </div>
          <Button asChild variant="hero" className="shrink-0 rounded-full">
            <Link to="/explore" search={{ kind: "all" }}>Book something new</Link>
          </Button>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Plane} label="Upcoming trips" value={String(upcoming.length)} delta="+2" index={0} />
          <StatCard icon={CalendarCheck} label="Total bookings" value={String(data?.length ?? 0)} delta="+18%" index={1} />
          <StatCard icon={Wallet} label="Lifetime spend" value={`$${totalSpend.toLocaleString()}`} delta="+12%" index={2} />
          <StatCard icon={Heart} label="Saved listings" value="14" index={3} />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
            <h2 className="font-display text-lg font-semibold">Monthly travel spend</h2>
            <div className="mt-6 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spendData}>
                  <defs>
                    <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
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
                  <Area type="monotone" dataKey="spend" stroke="var(--color-primary)" strokeWidth={2.5} fill="url(#spendFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <Bell className="size-4.5 text-primary" /> Notifications
            </h2>
            <ul className="mt-5 space-y-4">
              {notifications.map((n) => (
                <li key={n.title} className="rounded-2xl bg-secondary/50 p-4">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <p className="truncate text-sm font-semibold">{n.title}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">{n.time}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-border bg-card p-6 shadow-soft">
          <Tabs defaultValue="all">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
              <h2 className="min-w-0 truncate font-display text-lg font-semibold">My bookings</h2>
              <TabsList className="shrink-0 rounded-full">
                <TabsTrigger value="all" className="rounded-full">All</TabsTrigger>
                <TabsTrigger value="upcoming" className="rounded-full">Upcoming</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="all" className="mt-6">
              <BookingTable
                bookings={data}
                isLoading={isLoading}
                onCancel={(id) => cancel.mutate(id)}
                pendingId={cancel.isPending ? cancel.variables : undefined}
              />
            </TabsContent>
            <TabsContent value="upcoming" className="mt-6">
              <BookingTable
                bookings={upcoming}
                isLoading={isLoading}
                onCancel={(id) => cancel.mutate(id)}
                pendingId={cancel.isPending ? cancel.variables : undefined}
              />
            </TabsContent>
          </Tabs>
        </div>

        <div className="mt-8 rounded-3xl border border-border bg-card p-6 shadow-soft">
          <h2 className="font-display text-lg font-semibold">Bookings by category</h2>
          <div className="mt-6 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="type" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
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
                <Bar dataKey="count" fill="var(--color-primary)" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function BookingTable({
  bookings,
  isLoading,
  onCancel,
  pendingId,
}: {
  bookings?: Booking[];
  isLoading: boolean;
  onCancel: (id: string) => void;
  pendingId?: string;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!bookings?.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-16 text-center">
        <p className="font-display text-lg font-semibold">No bookings here yet</p>
        <Button asChild variant="outline" className="mt-4 rounded-full">
          <Link to="/explore" search={{ kind: "all" }}>Find something to book</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Listing</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Guests</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((b) => (
            <TableRow key={b.id}>
              <TableCell>
                <div className="flex min-w-0 items-center gap-3">
                  <img
                    src={b.image}
                    alt=""
                    loading="lazy"
                    className="size-11 shrink-0 rounded-xl object-cover"
                  />
                  <span className="min-w-0 truncate font-medium">{b.listingTitle}</span>
                </div>
              </TableCell>
              <TableCell className="font-mono text-xs">{b.reference}</TableCell>
              <TableCell className="whitespace-nowrap">{b.date}</TableCell>
              <TableCell>{b.guests}</TableCell>
              <TableCell>${b.total.toLocaleString()}</TableCell>
              <TableCell><StatusBadge status={b.status} /></TableCell>
              <TableCell className="text-right">
                {["pending", "approved", "confirmed"].includes(b.status) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    disabled={pendingId === b.id}
                    onClick={() => onCancel(b.id)}
                  >
                    {pendingId === b.id ? <Loader2 className="size-3.5 animate-spin" /> : "Cancel"}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
