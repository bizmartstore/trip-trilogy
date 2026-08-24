import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AnimatePresence, motion } from "motion/react";
import { RotateCcw, Send, X } from "lucide-react";
import { fetchDestinations, fetchPackages, fetchSettings, searchListings } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Fallback while /api/chat reports the admin-configured limit. */
const DEFAULT_LIMIT = 10;
const QUOTA_KEY = "nexi-quota";
const HISTORY_KEY = "nexi-history";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  time: string;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function readQuota() {
  try {
    const raw = localStorage.getItem(QUOTA_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { date: string; count: number };
      if (parsed.date === todayKey()) return parsed.count;
    }
  } catch {
    // corrupted storage — reset
  }
  return 0;
}

function writeQuota(count: number) {
  try {
    localStorage.setItem(QUOTA_KEY, JSON.stringify({ date: todayKey(), count }));
  } catch {
    // storage unavailable — quota simply won't persist
  }
}

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ChatMessage[];
      if (Array.isArray(parsed) && parsed.length) return parsed.slice(-30);
    }
  } catch {
    // corrupted storage — start fresh
  }
  return [];
}

function saveHistory(messages: ChatMessage[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-30)));
  } catch {
    // ignore
  }
}

const WELCOME_TEXT =
  "Hi! I'm **NEXI** 🤖 — your Nexora travel concierge.\nAsk me anything about our tours, stays, dining and packages — or give me the **email + date you booked** and I'll check your reservation status. You get free AI questions daily, plus unlimited instant answers in the quick questions below.";

/** NEXI mascot — custom rounded-robot mark, not a stock icon. */
function NexiIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="nexi-body" x1="6" y1="8" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0e5951" />
          <stop offset="1" stopColor="#0b2b2b" />
        </linearGradient>
        <linearGradient
          id="nexi-antenna"
          x1="24"
          y1="2"
          x2="24"
          y2="12"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#f2c14e" />
          <stop offset="1" stopColor="#e8a33d" />
        </linearGradient>
      </defs>
      {/* antenna */}
      <line
        x1="24"
        y1="7"
        x2="24"
        y2="13"
        stroke="url(#nexi-antenna)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="24" cy="5" r="4" fill="url(#nexi-antenna)" />
      {/* ears */}
      <rect x="2" y="20" width="6" height="10" rx="3" fill="#0e5951" />
      <rect x="40" y="20" width="6" height="10" rx="3" fill="#0e5951" />
      {/* head */}
      <rect x="7" y="13" width="34" height="28" rx="9" fill="url(#nexi-body)" />
      {/* visor */}
      <rect x="12" y="19" width="24" height="12" rx="6" fill="#eafaf4" opacity="0.96" />
      {/* eyes */}
      <circle cx="19.5" cy="25" r="2.6" fill="#0b2b2b" />
      <circle cx="28.5" cy="25" r="2.6" fill="#0b2b2b" />
      {/* smile */}
      <path
        d="M18 35c2.2 2.2 9.8 2.2 12 0"
        stroke="#f2c14e"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface FaqItem {
  icon: string;
  label: string;
  answer: () => Promise<string>;
}

const peso = (n: number) => `₱${n.toLocaleString()}`;
const link = (title: string, slug: string) => `[${title}](/listing/${slug})`;

function listingLines(items: Awaited<ReturnType<typeof searchListings>>, max = 5) {
  return items
    .slice(0, max)
    .map(
      (l) =>
        `- ${link(l.title, l.slug)} — ${l.currency} ${peso(l.price)} ${l.unit}${
          l.durationDays ? `, ${l.durationDays} day${l.durationDays > 1 ? "s" : ""}` : ""
        }\n   ${l.tagline}`,
    )
    .join("\n");
}

const FAQS: FaqItem[] = [
  {
    icon: "🏝️",
    label: "Most popular tours",
    answer: async () => {
      const tours = await searchListings({
        q: "",
        kind: "tour",
        destination: "all",
        minPrice: 0,
        maxPrice: 50000,
        minRating: 0,
        tags: [],
        sort: "popular",
      });
      return `Here are our most-loved tours right now:\n\n${listingLines(tours)}\n\nBrowse everything on the [Explore page](/explore). Want me to check availability or help you plan a route? Try the [Trip Planner](/planner).`;
    },
  },
  {
    icon: "🏨",
    label: "Where to stay",
    answer: async () => {
      const stays = await searchListings({
        q: "",
        kind: "stay",
        destination: "all",
        minPrice: 0,
        maxPrice: 50000,
        minRating: 0,
        tags: [],
        sort: "popular",
      });
      return `Hand-picked stays across Palawan:\n\n${listingLines(stays)}\n\nEach stay links to its own page where you can pick rooms and book instantly.`;
    },
  },
  {
    icon: "🍽️",
    label: "Best places to eat",
    answer: async () => {
      const dining = await searchListings({
        q: "",
        kind: "restaurant",
        destination: "all",
        minPrice: 0,
        maxPrice: 50000,
        minRating: 0,
        tags: [],
        sort: "popular",
      });
      return `Standout tables worth booking ahead:\n\n${listingLines(dining)}\n\nOpen any of them for menus, best-sellers and reservation times.`;
    },
  },
  {
    icon: "💰",
    label: "Travel packages & prices",
    answer: async () => {
      const pkgs = (await fetchPackages()).filter((p) => p.active !== false);
      const lines = pkgs
        .sort((a, b) => a.price - b.price)
        .map(
          (p) =>
            `- **${p.name}** — ${peso(p.price)}${p.durationDays ? ` · ${p.durationDays} days` : ""}${p.guestLimit ? ` · up to ${p.guestLimit} guests` : ""}\n   Includes: ${(p.inclusions ?? []).slice(0, 4).join(", ")}`,
        )
        .join("\n");
      return `Our travel package tiers:\n\n${lines}\n\nCompare them all on the [Explore page](/explore) — every tour and stay shows its available tiers before you book.`;
    },
  },
  {
    icon: "🪙",
    label: "Experiences under ₱5,000",
    answer: async () => {
      const budget = await searchListings({
        q: "",
        kind: "all",
        destination: "all",
        minPrice: 0,
        maxPrice: 5000,
        minRating: 0,
        tags: [],
        sort: "price-asc",
      });
      return `Big adventures, small budget:\n\n${listingLines(budget)}\n\nAll prices are final at checkout — no hidden fees.`;
    },
  },
  {
    icon: "📋",
    label: "Check my booking status",
    answer: async () => {
      return `To check your reservation:\n\n1. Open your **[Dashboard](/dashboard)** and sign in with the email you booked with.\n2. Or ask me here — just type your **email address + the date you booked** and I'll pull up the exact status, reference number and payment state instantly.\n3. Have a reference code? Your receipt lives at [/booking/YOUR-CODE](/dashboard).`;
    },
  },
  {
    icon: "❌",
    label: "Cancellation & refunds",
    answer: async () => {
      return `Short version: most listings offer **free cancellation 48 hours–14 days before** your start date (each listing shows its exact window). After the window, 50% is typically refundable; operator-cancelled trips are always fully refunded.\n\nFull terms: [Cancellation Policy](/cancellation-policy). Your booking's specific rule is also shown on its listing page and receipt.`;
    },
  },
  {
    icon: "📅",
    label: "How do I book?",
    answer: async () => {
      return `Booking takes about a minute:\n\n1. Find an experience on the [Explore page](/explore).\n2. Pick your date, guests and package tier.\n3. Confirm — you'll get an instant reference number, and the team approves reservations quickly (you'll be notified by push/email).\n\nTrack everything anytime in your [Dashboard](/dashboard).`;
    },
  },
  {
    icon: "🗺️",
    label: "Destinations we cover",
    answer: async () => {
      const dests = await fetchDestinations();
      const lines = dests.map((d) => `- **${d.name}** (${d.country}) — ${d.tagline}`).join("\n");
      return `We currently cover Palawan's best:\n\n${lines}\n\nStart exploring any of them on the [Explore page](/explore).`;
    },
  },
  {
    icon: "☎️",
    label: "Contact a human",
    answer: async () => {
      const s = await fetchSettings();
      const lines = [
        s.contactEmail && `- Email: ${s.contactEmail}`,
        s.contactPhone && `- Phone: ${s.contactPhone}`,
        s.contactMobile && `- Mobile / Viber / WhatsApp: ${s.contactMobile}`,
        s.officeHours && `- Office hours: ${s.officeHours}`,
      ]
        .filter(Boolean)
        .join("\n");
      return `Happy to connect you with the team:\n\n${lines || "- Reach us via the Help Centre."}\n\nFor policy questions the [Help Centre](/help-centre) has detailed guides too.`;
    },
  },
];

/** Contextual next-question picks based on what NEXI just talked about. */
function followUpsFor(text: string): FaqItem[] {
  const t = text.toLowerCase();
  const find = (label: string) => FAQS.find((f) => f.label === label)!;
  if (/book|status|reference|reserv/.test(t)) {
    return [find("Cancellation & refunds"), find("How do I book?"), find("Contact a human")];
  }
  if (/stay|hotel|resort|hostel|room|villa/.test(t)) {
    return [
      find("Best places to eat"),
      find("Most popular tours"),
      find("Travel packages & prices"),
    ];
  }
  if (/tour|island|dive|lagoon|beach|cruise/.test(t)) {
    return [find("Where to stay"), find("Experiences under ₱5,000"), find("Destinations we cover")];
  }
  if (/eat|food|restaurant|menu|dining/.test(t)) {
    return [find("Where to stay"), find("Most popular tours"), find("Contact a human")];
  }
  return [find("Most popular tours"), find("Where to stay"), find("Check my booking status")];
}

function nowLabel() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Minimal markdown renderer: **bold**, [links](url), newlines, "- " bullets. */
function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const bullet = /^[-•*]\s+/.test(line);
        const content = line.replace(/^[-•*]\s+/, "");
        const parts = content.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((part, j) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return (
              <strong key={j} className="font-semibold">
                {part.slice(2, -2)}
              </strong>
            );
          }
          const md = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
          if (md) {
            return (
              <a
                key={j}
                href={md[2]}
                className="font-semibold underline decoration-dotted underline-offset-2 transition hover:opacity-80"
                style={{ color: "inherit" }}
              >
                {md[1]}
              </a>
            );
          }
          return <span key={j}>{part}</span>;
        });
        return bullet ? (
          <p key={i} className="flex gap-1.5 pl-1">
            <span className="text-primary">•</span>
            <span>{parts}</span>
          </p>
        ) : (
          <p key={i}>{parts.length ? parts : "\u00A0"}</p>
        );
      })}
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1" aria-label="NEXI is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-2 animate-bounce rounded-full bg-primary/60"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: "900ms" }}
        />
      ))}
    </div>
  );
}

export function NexoraChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = loadHistory();
    return saved.length ? saved : [{ role: "assistant", text: WELCOME_TEXT, time: "now" }];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [usedCount, setUsedCount] = useState(() => readQuota());
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [showAllFaqs, setShowAllFaqs] = useState(false);
  const [unread, setUnread] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
    if (open) setUnread(0);
  }, [open]);

  useEffect(() => {
    fetch("/api/chat")
      .then((r) => r.json())
      .then((j: { ok?: boolean; limit?: number }) => {
        if (j?.limit && j.limit > 0) setLimit(j.limit);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    saveHistory(messages);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!loading)
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 350);
  }, [open]);

  const quotaReached = usedCount >= limit;
  const remaining = Math.max(0, limit - usedCount);

  function patchLast(patch: Partial<ChatMessage>) {
    setMessages((prev) => {
      if (!prev.length) return prev;
      const copy = [...prev];
      copy[copy.length - 1] = { ...copy[copy.length - 1], ...patch };
      return copy;
    });
  }

  function push(msg: ChatMessage) {
    setMessages((prev) => [...prev, msg]);
    if (msg.role === "assistant" && !openRef.current) setUnread((u) => u + 1);
  }

  /** Instant, quota-free FAQ answers built from live catalog data. */
  const answerFaq = useCallback(
    async (faq: FaqItem) => {
      if (loading) return;
      push({ role: "user", text: faq.label, time: nowLabel() });
      setLoading(true);
      let text: string;
      try {
        text = await faq.answer();
      } catch {
        text = "I couldn't load live data just now — please try again in a moment.";
      }
      push({ role: "assistant", text, time: nowLabel() });
      setLoading(false);
    },
    [loading],
  );

  /** Streams the AI reply token-by-token — first words appear in ~1–2s. */
  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      const history = [...messages, { role: "user" as const, text: trimmed }];
      push({ role: "user", text: trimmed, time: nowLabel() });
      setInput("");
      setLoading(true);
      let acc = "";
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history.map((m) => ({ role: m.role, text: m.text })),
          }),
        });
        if (!res.ok || !res.body) {
          const json = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(json?.error ?? "Something went wrong.");
        }
        push({ role: "assistant", text: "", time: nowLabel() });
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let failed = false;
        let isLocal = false;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, sep).trim();
            buffer = buffer.slice(sep + 2);
            if (!frame.startsWith("data:")) continue;
            try {
              const evt = JSON.parse(frame.slice(5).trim()) as {
                t?: string;
                error?: string;
                done?: boolean;
                local?: boolean;
              };
              if (evt.t) {
                acc += evt.t;
                patchLast({ text: acc });
              }
              if (evt.local) isLocal = true;
              if (evt.error) {
                failed = true;
                patchLast({ text: `⚠️ ${evt.error}` });
              }
            } catch {
              // incomplete frame — wait for more chunks
            }
          }
        }
        if (!acc && !failed) {
          patchLast({
            text: "⚠️ Empty reply from the assistant — please tap ↺ and try again.",
          });
        } else if (!failed && acc && !isLocal) {
          // Only real AI answers consume the daily free quota — instant local
          // answers are always free.
          const next = usedCount + 1;
          setUsedCount(next);
          writeQuota(next);
          setShowAllFaqs(false);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : undefined;
        push({
          role: "assistant",
          text: `⚠️ ${message ?? "I couldn't reach the server just now. Please check your connection and try again."}`,
          time: nowLabel(),
        });
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, usedCount],
  );

  function reset() {
    setMessages([{ role: "assistant", text: WELCOME_TEXT, time: nowLabel() }]);
    setShowAllFaqs(false);
  }

  const visibleChips = useMemo(
    () => (showAllFaqs || quotaReached ? FAQS : FAQS.slice(0, 4)),
    [showAllFaqs, quotaReached],
  );

  const showFaqPanel = showAllFaqs || quotaReached;
  const lastMsg = messages[messages.length - 1];
  const followUps =
    !loading && lastMsg?.role === "assistant" && messages.length > 1
      ? followUpsFor(lastMsg.text)
      : [];

  return (
    <>
      {/* Floating launcher */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="launcher"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
            onClick={() => setOpen(true)}
            aria-label="Chat with NEXI, the Nexora assistant"
            className="group fixed bottom-24 right-4 z-50 flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-deep p-1 pr-1 shadow-xl shadow-primary/30 ring-1 ring-white/10 transition-transform hover:scale-105 active:scale-95 sm:bottom-6 sm:right-6"
          >
            <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-primary/30 [animation-duration:2.5s]" />
            <NexiIcon className="size-12 drop-shadow-sm sm:size-14" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow">
                {unread}
              </span>
            )}
            <span className="hidden pr-4 text-left leading-tight text-primary-foreground sm:block">
              <span className="block text-sm font-bold">Need help?</span>
              <span className="block text-[11px] text-primary-foreground/70">Ask NEXI 🤖</span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat modal */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="chat-panel"
            initial={{ opacity: 0, y: 32, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 32, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            role="dialog"
            aria-label="NEXI chat assistant"
            className="fixed inset-x-2 bottom-2 top-16 z-50 flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-card shadow-2xl shadow-deep/25 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:top-auto sm:h-[min(660px,calc(100vh-3rem))] sm:w-[430px]"
          >
            {/* Header */}
            <div className="relative bg-gradient-to-r from-primary via-primary to-deep px-4 pb-4 pt-3.5 text-primary-foreground">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_55%)]" />
              <div className="relative flex items-center gap-3">
                <div className="relative">
                  <NexiIcon className="size-11 drop-shadow-md" />
                  <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-primary bg-emerald-400" />
                </div>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-sm font-bold tracking-wide">NEXI</p>
                  <p className="flex items-center gap-1.5 text-[11px] text-primary-foreground/75">
                    Nexora AI concierge · Tours · Stays · Bookings
                  </p>
                </div>
                <button
                  onClick={reset}
                  aria-label="Restart conversation"
                  title="Restart conversation"
                  className="rounded-full p-2 text-primary-foreground/80 transition hover:bg-white/15 hover:text-primary-foreground"
                >
                  <RotateCcw className="size-4" />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close chat"
                  className="rounded-full p-2 text-primary-foreground/80 transition hover:bg-white/15 hover:text-primary-foreground"
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 space-y-3 overflow-y-auto bg-background/60 px-3.5 py-4"
            >
              {messages.map((m, i) => {
                const slugMatch =
                  m.role === "assistant" ? m.text.match(/\/listing\/([a-z0-9-]+)/) : null;
                const bookSlug = slugMatch?.[1];
                return (
                  <motion.div
                    key={`${i}-${m.time}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                      "flex w-full gap-2",
                      m.role === "user" ? "justify-end" : "justify-start",
                    )}
                  >
                    {m.role === "assistant" && <NexiIcon className="mt-1 size-7 shrink-0" />}
                    <div
                      className={cn(
                        "max-w-[82%] space-y-1.5",
                        m.role === "user" ? "items-end" : "items-start",
                      )}
                    >
                      <div
                        className={cn(
                          "rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed shadow-sm",
                          m.role === "user"
                            ? "rounded-br-md bg-primary text-primary-foreground"
                            : "rounded-bl-md border border-border/50 bg-card text-card-foreground",
                        )}
                      >
                        {m.role === "assistant" && !m.text && loading ? (
                          <TypingDots />
                        ) : (
                          <RichText text={m.text} />
                        )}
                      </div>
                      {bookSlug && (
                        <a
                          href={`/listing/${bookSlug}`}
                          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-gold to-sand px-3.5 py-1.5 text-[11px] font-bold text-deep shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
                        >
                          📖 View details & book now
                        </a>
                      )}
                      <p
                        className={cn(
                          "px-1 text-[10px] text-muted-foreground",
                          m.role === "user" ? "text-right" : "text-left",
                        )}
                      >
                        {m.time}
                      </p>
                    </div>
                  </motion.div>
                );
              })}

              {loading && lastMsg?.role === "user" && (
                <div className="flex items-end gap-2">
                  <NexiIcon className="size-7 shrink-0" />
                  <div className="rounded-2xl rounded-bl-md border border-border/50 bg-card px-3.5 py-2 shadow-sm">
                    <TypingDots />
                  </div>
                </div>
              )}

              {/* Contextual follow-ups */}
              {!showFaqPanel && followUps.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {followUps.map((f) => (
                    <button
                      key={`fu-${f.label}`}
                      onClick={() => (remaining > 0 ? send(f.label) : answerFaq(f))}
                      disabled={loading}
                      className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-[11px] font-medium text-primary transition hover:bg-primary/15 disabled:opacity-50"
                    >
                      {f.icon} {f.label}
                    </button>
                  ))}
                </div>
              )}

              {quotaReached && !loading && (
                <div className="rounded-xl border border-gold/40 bg-gold/10 px-3.5 py-3 text-xs leading-relaxed text-foreground">
                  You've used all <strong>{limit} free full-AI questions</strong> today. NEXI still
                  answers from quick knowledge — keep chatting, or tap the instant answers below.
                  Full AI resets tomorrow, or hit ↺ to start over.
                </div>
              )}

              {/* FAQ chips */}
              <div className={cn("grid grid-cols-1 gap-2 pt-1", showFaqPanel && "sm:grid-cols-2")}>
                {visibleChips.map((f) => (
                  <button
                    key={f.label}
                    onClick={() => answerFaq(f)}
                    disabled={loading}
                    className="group flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2.5 text-left text-xs font-medium text-foreground/90 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent hover:text-accent-foreground hover:shadow-md disabled:opacity-60"
                  >
                    <span className="text-base">{f.icon}</span>
                    <span>{f.label}</span>
                  </button>
                ))}
              </div>

              {!quotaReached && !showAllFaqs && (
                <button
                  onClick={() => setShowAllFaqs(true)}
                  className="mx-auto block rounded-full border border-border/60 bg-card px-3.5 py-1.5 text-[11px] font-medium text-muted-foreground shadow-sm transition hover:border-primary/40 hover:text-foreground"
                >
                  More quick answers ({FAQS.length - 4}) ↓
                </button>
              )}
            </div>

            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="border-t border-border/60 bg-card px-3 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2.5"
            >
              <div
                className={cn(
                  "flex items-center gap-2 rounded-full border border-border bg-background pl-4 pr-1.5 py-1.5 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20",
                )}
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    quotaReached
                      ? "NEXI's on quick-knowledge mode — ask away!"
                      : remaining <= 3
                        ? `Ask NEXI anything… (${remaining} free full-AI left today)`
                        : "Ask about tours, prices, my booking…"
                  }
                  maxLength={600}
                  className="h-8 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  aria-label="Send message"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-deep text-primary-foreground shadow-md transition enabled:hover:scale-105 enabled:active:scale-95 disabled:opacity-40"
                >
                  <Send className="size-4" />
                </button>
              </div>
              <p className="pt-1.5 text-center text-[10px] text-muted-foreground">
                NEXI can occasionally make mistakes — verify important details.
              </p>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
