import { Link, useRouterState } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  Bell,
  LayoutDashboard,
  Menu,
  Moon,
  Sun,
  Sunset,
  UserRound,
  Waves,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { NEXORA_LOGO_SRC } from "@/lib/brand";
import { useAuth } from "@/hooks/use-auth";
import { fetchNotifications } from "@/lib/api";

const nav = [
  { to: "/explore", label: "Explore", search: { kind: "all" as const } },
  { to: "/explore", label: "Tours", search: { kind: "tour" as const } },
  { to: "/explore", label: "Stays", search: { kind: "stay" as const } },
  { to: "/explore", label: "Dining", search: { kind: "restaurant" as const } },
  { to: "/explore", label: "Packages", search: { kind: "package" as const } },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { user, signOut, isAdmin } = useAuth();
  const notifications = useQuery({
    queryKey: ["notifications", user?.email],
    queryFn: () => fetchNotifications(user!.email),
    enabled: !!user && user.role !== "admin",
    refetchInterval: 30_000,
  });
  const unreadCount = notifications.data?.filter((n) => !n.read).length ?? 0;
  const { theme, setTheme } = useTheme();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const overHero = pathname === "/" && !scrolled;

  const THEME_META = {
    light: { label: "Daybreak", icon: Sun, next: "sunset" as const },
    sunset: { label: "Sunset", icon: Sunset, next: "ocean" as const },
    ocean: { label: "Ocean", icon: Waves, next: "dark" as const },
    dark: { label: "Midnight", icon: Moon, next: "light" as const },
  } as const;
  const currentTheme = THEME_META[theme];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-500",
        scrolled ? "py-2" : "py-4",
      )}
    >
      <div className="container-x">
        <div
          className={cn(
            "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-3xl px-4 py-3 transition-all duration-500 md:flex md:justify-between",
            scrolled ? "glass shadow-soft" : "bg-transparent",
          )}
        >
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <img
              src={NEXORA_LOGO_SRC}
              alt="Nexora"
              className="size-9 shrink-0 rounded-2xl object-contain"
            />
            <span
              className={cn(
                "truncate font-display text-lg font-semibold tracking-tight transition-colors",
                overHero ? "text-deep-foreground" : "text-foreground",
              )}
            >
              Nexora
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                search={item.search}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  overHero
                    ? "text-deep-foreground/85 hover:bg-background/15 hover:text-deep-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
            <Link
              to="/planner"
              className={cn(
                "ml-1 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                overHero ? "text-gold hover:bg-background/15" : "text-primary hover:bg-primary/10",
              )}
            >
              <Sparkles className="size-4" />
              Trip Planner
            </Link>
          </nav>

          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Colour theme: ${currentTheme.label}. Switch to ${THEME_META[currentTheme.next].label}`}
              title={`Theme: ${currentTheme.label} — tap for ${THEME_META[currentTheme.next].label}`}
              onClick={() => setTheme(currentTheme.next)}
              className={cn(
                "rounded-full",
                overHero && "text-deep-foreground hover:bg-background/15",
              )}
            >
              <currentTheme.icon className="size-4.5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              aria-label="Notifications"
              asChild
              className={cn(
                "relative rounded-full",
                overHero && "text-deep-foreground hover:bg-background/15",
              )}
            >
              <Link to="/dashboard">
                <Bell className="size-4.5" />
                {user && !isAdmin && unreadCount > 0 ? (
                  <span className="absolute right-1 top-1 grid min-w-[18px] place-items-center rounded-full bg-gold px-1 text-[10px] font-bold text-gold-foreground">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
              </Link>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Account menu"
                  className={cn(
                    "hidden rounded-full sm:inline-flex",
                    overHero && "text-deep-foreground hover:bg-background/15",
                  )}
                >
                  <UserRound className="size-4.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 rounded-2xl">
                <DropdownMenuLabel className="truncate">
                  {user ? user.name : "Account"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/dashboard">
                    <LayoutDashboard className="size-4" /> My dashboard
                  </Link>
                </DropdownMenuItem>
                {isAdmin ? (
                  <DropdownMenuItem asChild>
                    <Link to="/admin">
                      <LayoutDashboard className="size-4" /> Admin console
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                {user ? (
                  <DropdownMenuItem onSelect={() => signOut()}>Sign out</DropdownMenuItem>
                ) : (
                  <DropdownMenuItem asChild>
                    <Link to="/auth">Sign in</Link>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {user ? (
              <Button
                asChild
                variant={overHero ? "sand" : "default"}
                className="hidden rounded-full md:inline-flex"
              >
                <Link to="/dashboard">My trips</Link>
              </Button>
            ) : (
              <Button
                asChild
                variant={overHero ? "sand" : "default"}
                className="hidden rounded-full md:inline-flex"
              >
                <Link to="/auth">Sign in</Link>
              </Button>
            )}

            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open menu"
                  className={cn(
                    "rounded-full md:hidden",
                    overHero && "text-deep-foreground hover:bg-background/15",
                  )}
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[85vw] max-w-sm p-6">
                <div className="mt-8 flex flex-col gap-1">
                  {nav.map((item) => (
                    <Link
                      key={item.label}
                      to={item.to}
                      search={item.search}
                      onClick={() => setOpen(false)}
                      className="rounded-xl px-3 py-3 text-base font-medium hover:bg-muted"
                    >
                      {item.label}
                    </Link>
                  ))}
                  <Link
                    to="/planner"
                    onClick={() => setOpen(false)}
                    className="rounded-xl px-3 py-3 text-base font-medium text-primary hover:bg-muted"
                  >
                    Trip Planner
                  </Link>
                  <Link
                    to="/dashboard"
                    onClick={() => setOpen(false)}
                    className="rounded-xl px-3 py-3 text-base font-medium hover:bg-muted"
                  >
                    My dashboard
                  </Link>
                  {isAdmin ? (
                    <Link
                      to="/admin"
                      onClick={() => setOpen(false)}
                      className="rounded-xl px-3 py-3 text-base font-medium hover:bg-muted"
                    >
                      Admin console
                    </Link>
                  ) : null}
                  {user ? (
                    <Button
                      className="mt-4 rounded-full"
                      onClick={() => {
                        signOut();
                        setOpen(false);
                      }}
                    >
                      Sign out
                    </Button>
                  ) : (
                    <Button asChild className="mt-4 rounded-full">
                      <Link to="/auth" onClick={() => setOpen(false)}>
                        Sign in
                      </Link>
                    </Button>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </motion.header>
  );
}
