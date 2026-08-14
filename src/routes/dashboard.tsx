import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { useEffect, useMemo } from "react";
import { toast } from "sonner";

import { NotificationPreferences } from "@/components/dashboard/notification-preferences";
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
import {
  fetchBookingsForEmail,
  fetchFavorites,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateBookingStatus,
} from "@/lib/api";
import { formatRelativeTime } from "@/lib/format-relative";
import type { Booking } from "@/lib/types";
import { cn, peso } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "My Trips Dashboard | Nexora" },
      {
        name: "description",
        content:
          "Track every tour, stay and restaurant reservation in one place — statuses, spend, upcoming trips and notifications.",
      },
      { property: "og:title", content: "My Trips Dashboard | Nexora" },
      { property: "og:description", content: "Manage all your Nexora bookings in one dashboard." },
    ],
  }),
  component: Dashboard,
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function buildSpendChart(bookings: Booking[]) {
  const now = new Date();
  const buckets = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return {
      month: MONTHS[d.getMonth()],
      spend: 0,
      key: `${d.getFullYear()}-${d.getMonth()}`,
    };
  });

  for (const b of bookings) {
    if (b.status === "cancelled") continue;
    const raw = b.createdAt ?? b.date;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const bucket = buckets.find((x) => x.key === key);
    if (bucket) bucket.spend += b.total;
  }

  return buckets.map(({ month, spend }) => ({ month, spend }));
}

function buildTypeChart(bookings: Booking[]) {
  const counts = { Tours: 0, Stays: 0, Dining: 0 };
  for (const b of bookings) {
    if (b.status === "cancelled") continue;
    if (b.kind === "tour") counts.Tours += 1;
    else if (b.kind === "stay") counts.Stays += 1;
    else if (b.kind === "restaurant") counts.Dining += 1;
  }
  return [
    { type: "Tours", count: counts.Tours },
    { type: "Stays", count: counts.Stays },
    { type: "Dining", count: counts.Dining },
  ];
}

function Dashboard() {
  const qc = useQueryClient();
  const { user, ready } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (user.role === "admin") navigate({ to: "/admin" });
  }, [ready, user, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["bookings", user?.email],
    queryFn: () => fetchBookingsForEmail(user!.email),
    enabled: !!user && user.role !== "admin",
  });

  const favorites = useQuery({
    queryKey: ["favorites", user?.email],
    queryFn: () => fetchFavorites(user!.email),
    enabled: !!user && user.role !== "admin",
  });

  const notifications = useQuery({
    queryKey: ["notifications", user?.email],
    queryFn: () => fetchNotifications(user!.email),
    enabled: !!user && user.role !== "admin",
  });

  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead(user!.email, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["notifications", user?.email] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => markAllNotificationsRead(user!.email),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["notifications", user?.email] }),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => updateBookingStatus(id, "cancelled"),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["bookings", user?.email] });
      const prev = qc.getQueryData<Booking[]>(["bookings", user?.email]);
      qc.setQueryData<Booking[]>(["bookings", user?.email], (old) =>
        old?.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b)),
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      qc.setQueryData(["bookings", user?.email], ctx?.prev);
      toast.error("Could not cancel that booking");
    },
    onSuccess: () =>
      toast.success("Booking cancelled", {
        description: "A refund confirmation is on its way.",
      }),
  });

  const upcoming =
    data?.filter((b) => ["pending", "approved", "confirmed"].includes(b.status)) ?? [];
  const totalSpend = data?.reduce((s, b) => s + (b.status === "cancelled" ? 0 : b.total), 0) ?? 0;
  const spendData = useMemo(() => buildSpendChart(data ?? []), [data]);
  const typeData = useMemo(() => buildTypeChart(data ?? []), [data]);
  const unreadCount = notifications.data?.filter((n) => !n.read).length ?? 0;

  if (!ready || !user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center pt-28">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pb-8 pt-28">
      <div className="container-x">
        <div className="flex flex-col gap-4 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold sm:text-4xl">
              Welcome back, {user.name.split(" ")[0]}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              Everything you've booked across Nexora, in one timeline.
            </p>
          </div>
          <Button asChild variant="hero" className="w-full shrink-0 rounded-full sm:w-auto">
            <Link to="/explore" search={{ kind: "all" }}>
              Book something new
            </Link>
          </Button>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Plane} label="Upcoming trips" value={String(upcoming.length)} index={0} />
          <StatCard icon={CalendarCheck} label="Total bookings" value={String(data?.length ?? 0)} index={1} />
          <StatCard icon={Wallet} label="Lifetime spend" value={peso(totalSpend)} index={2} />
          <StatCard
            icon={Heart}
            label="Saved listings"
            value={String(favorites.data?.length ?? 0)}
            index={3}
          />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6">
            <h2 className="font-display text-lg font-semibold">Monthly travel spend</h2>
            <div className="mt-6 h-56 w-full sm:h-64">
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

          <div className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                <Bell className="size-4.5 text-primary" /> Notifications
                {unreadCount ? (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                    {unreadCount}
                  </span>
                ) : null}
              </h2>
              {unreadCount ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 rounded-full text-xs"
                  disabled={markAllRead.isPending}
                  onClick={() => markAllRead.mutate()}
                >
                  Mark all read
                </Button>
              ) : null}
            </div>
            {notifications.isLoading ? (
              <div className="mt-5 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-2xl" />
                ))}
              </div>
            ) : notifications.data?.length ? (
              <ul className="mt-5 max-h-[320px] space-y-3 overflow-y-auto">
                {notifications.data.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={cn(
                        "w-full rounded-2xl p-4 text-left transition-colors",
                        n.read ? "bg-secondary/30" : "bg-primary/8 ring-1 ring-primary/20",
                      )}
                      onClick={() => {
                        if (!n.read) markRead.mutate(n.id);
                        if (n.link) {
                          if (n.link.startsWith("http")) {
                            window.open(n.link, "_blank", "noopener,noreferrer");
                          } else {
                            navigate({ to: n.link as "/dashboard" });
                          }
                        }
                      }}
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                        <p className="truncate text-sm font-semibold">{n.title}</p>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatRelativeTime(n.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                      {!n.read ? (
                        <span className="mt-2 inline-block text-xs font-medium text-primary">Unread</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                No notifications yet. Booking updates and admin messages will appear here.
              </p>
            )}
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6">
          <Tabs defaultValue="all">
            <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <h2 className="min-w-0 truncate font-display text-lg font-semibold">My bookings</h2>
              <TabsList className="w-full shrink-0 rounded-full sm:w-auto">
                <TabsTrigger value="all" className="flex-1 rounded-full sm:flex-none">
                  All
                </TabsTrigger>
                <TabsTrigger value="upcoming" className="flex-1 rounded-full sm:flex-none">
                  Upcoming
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="all" className="mt-6">
              <BookingList
                bookings={data}
                isLoading={isLoading}
                onCancel={(id) => cancel.mutate(id)}
                pendingId={cancel.isPending ? cancel.variables : undefined}
              />
            </TabsContent>
            <TabsContent value="upcoming" className="mt-6">
              <BookingList
                bookings={upcoming}
                isLoading={isLoading}
                onCancel={(id) => cancel.mutate(id)}
                pendingId={cancel.isPending ? cancel.variables : undefined}
              />
            </TabsContent>
          </Tabs>
        </div>

        <div className="mt-8">
          <NotificationPreferences email={user.email} />
        </div>

        <div className="mt-8 rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6">
          <h2 className="font-display text-lg font-semibold">Bookings by category</h2>
          <div className="mt-6 h-48 w-full sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="type" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
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

function BookingList({
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
          <Link to="/explore" search={{ kind: "all" }}>
            Find something to book
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4 md:hidden">
        {bookings.map((b) => (
          <article key={b.id} className="rounded-2xl border border-border bg-secondary/20 p-4">
            <div className="flex gap-3">
              <img src={b.image} alt="" loading="lazy" className="size-14 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{b.listingTitle}</p>
                <p className="font-mono text-xs text-muted-foreground">{b.reference}</p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{b.date}</span>
                  <span>{b.guests} guest{b.guests === 1 ? "" : "s"}</span>
                  <span className="font-semibold text-foreground">{peso(b.total)}</span>
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <StatusBadge status={b.status} />
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
              ) : null}
            </div>
            {b.adminNote ? (
              <p className="mt-2 text-xs italic text-muted-foreground">“{b.adminNote}”</p>
            ) : null}
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
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
                <TableCell>{peso(b.total)}</TableCell>
                <TableCell>
                  <StatusBadge status={b.status} />
                  {b.statusUpdatedAt ? (
                    <p className="mt-1 whitespace-nowrap text-[11px] text-muted-foreground">
                      {new Date(b.statusUpdatedAt).toLocaleDateString()}
                    </p>
                  ) : null}
                  {b.adminNote ? (
                    <p className="max-w-[200px] truncate text-[11px] italic text-muted-foreground">
                      “{b.adminNote}”
                    </p>
                  ) : null}
                </TableCell>
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
    </>
  );
}
