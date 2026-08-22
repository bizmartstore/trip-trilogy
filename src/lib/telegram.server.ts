/**
 * Telegram Bot API helpers (server-only).
 * Admin group alerts for bookings — failures are logged and never fail the booking.
 *
 * Note: Telegram does not allow custom font colors via Bot API. We use emoji banners,
 * bold/underline HTML, and blockquotes so new / rejected / approved stand out clearly.
 */
import { firstEnv, keepAlive, syncEnvFromGlobal } from "@/lib/worker-env";
import { formatClock, formatShortDate } from "@/lib/booking-model";

function botToken() {
  syncEnvFromGlobal();
  return firstEnv("TELEGRAM_BOT_TOKEN", "TELEGRAM_TOKEN");
}

/** Main admin group (new + rejected bookings). */
function mainChatId() {
  syncEnvFromGlobal();
  return firstEnv("TELEGRAM_CHAT_ID", "TELEGRAM_GROUP_ID");
}

/** Separate group for approved bookings only. */
function approvedChatId() {
  syncEnvFromGlobal();
  return firstEnv("TELEGRAM_APPROVED_CHAT_ID", "TELEGRAM_APPROVED_GROUP_ID");
}

/** Group for day-before / day-of schedule reminders (NEXORA BOOKING REMINDERS). */
const DEFAULT_REMINDER_CHAT_ID = "-5530536297";

function reminderChatId() {
  syncEnvFromGlobal();
  return (
    firstEnv("TELEGRAM_REMINDER_CHAT_ID", "TELEGRAM_REMINDERS_CHAT_ID") ||
    DEFAULT_REMINDER_CHAT_ID
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type TelegramBookingAlert = {
  reference: string;
  listingTitle: string;
  kind: string;
  customer: string;
  customerEmail?: string;
  customerPhone?: string;
  date: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  durationDays?: number;
  durationNights?: number;
  guests: number;
  total: number;
  pricingType?: string;
  packageName?: string;
  packagePrice?: number;
  packageBilling?: string;
  packageInclusions?: string[];
  adminUrl?: string;
  /** Optional admin note / rejection reason */
  note?: string;
  status?: string;
};

function kindLabel(kind: string) {
  return kind === "tour"
    ? "Tour"
    : kind === "stay"
      ? "Stay"
      : kind === "restaurant"
        ? "Dining"
        : kind === "package"
          ? "Package"
          : kind;
}

function formatTotal(total: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(total);
}

function guestLines(alert: TelegramBookingAlert) {
  const startYmd = alert.startDate || alert.date;
  const endYmd = alert.endDate || startYmd;
  const startLabel = `${formatShortDate(startYmd)}${alert.startTime ? ` — ${formatClock(alert.startTime)}` : ""}`;
  const endLabel = `${formatShortDate(endYmd)}${alert.endTime ? ` — ${formatClock(alert.endTime)}` : ""}`;
  const duration =
    alert.durationDays || alert.durationNights
      ? `${alert.durationDays ?? 1} Days / ${alert.durationNights ?? 0} Nights`
      : "";
  const pricing =
    alert.packageBilling === "per_person"
      ? "Per Person"
      : alert.packageBilling === "per_night"
        ? "Per Night"
        : alert.pricingType === "per_person"
          ? "Per Person"
          : alert.pricingType === "per_night"
            ? "Per Night"
            : alert.pricingType === "per_package"
              ? "Per Package"
              : "";
  const lines = [
    `<b>Booking ID:</b> <code>${escapeHtml(alert.reference)}</code>`,
    `<b>${escapeHtml(kindLabel(alert.kind))}:</b> ${escapeHtml(alert.listingTitle)}`,
    `<b>Customer:</b> ${escapeHtml(alert.customer)}`,
  ];
  if (alert.customerEmail) lines.push(`<b>Email:</b> ${escapeHtml(alert.customerEmail)}`);
  if (alert.customerPhone) lines.push(`<b>Phone:</b> ${escapeHtml(alert.customerPhone)}`);
  if (alert.packageName) {
    const priceBit =
      alert.packagePrice != null ? ` · ${escapeHtml(formatTotal(alert.packagePrice))}` : "";
    const billingBit =
      alert.packageBilling === "per_person"
        ? " per person"
        : alert.packageBilling === "per_night"
          ? " per night"
          : "";
    lines.push(`<b>Package tier:</b> ${escapeHtml(alert.packageName)}${priceBit}${billingBit}`);
  }
  if (alert.packageInclusions?.length) {
    lines.push(
      `<b>Inclusions:</b> ${escapeHtml(alert.packageInclusions.slice(0, 8).join(" · "))}`,
    );
  }
  if (duration) lines.push(`<b>Duration:</b> ${escapeHtml(duration)}`);
  lines.push(
    `<b>Start:</b> ${escapeHtml(startLabel)}`,
    `<b>End:</b> ${escapeHtml(endLabel)}`,
    `<b>Guests:</b> ${alert.guests}`,
  );
  if (pricing) lines.push(`<b>Billing:</b> ${escapeHtml(pricing)}`);
  lines.push(`<b>Total:</b> ${escapeHtml(formatTotal(alert.total))}`);
  if (alert.status) lines.push(`<b>Status:</b> ${escapeHtml(alert.status)}`);
  return lines;
}

function formatBookingMessage(alert: TelegramBookingAlert) {
  const lines = [
    "🟦🟦🟦🟦🟦🟦🟦🟦",
    "🆕 <b><u>NEW BOOKING</u></b> 🆕",
    "🟦🟦🟦🟦🟦🟦🟦🟦",
    "",
    "<blockquote>Incoming reservation — needs admin review</blockquote>",
    "",
    ...guestLines(alert),
  ];
  if (alert.adminUrl) {
    lines.push("", `➡️ <a href="${escapeHtml(alert.adminUrl)}">Open admin dashboard</a>`);
  }
  return lines.join("\n");
}

function formatRejectedMessage(alert: TelegramBookingAlert) {
  const lines = [
    "🟥🟥🟥🟥🟥🟥🟥🟥",
    "❌ <b><u>BOOKING REJECTED</u></b> ❌",
    "🟥🟥🟥🟥🟥🟥🟥🟥",
    "",
    "<blockquote>Reservation declined — not confirmed</blockquote>",
    "",
    ...guestLines(alert).filter(
      (line) => !line.startsWith("<b>Guests:</b>") && !line.startsWith("<b>Total:</b>"),
    ),
  ];
  if (alert.note?.trim()) {
    lines.push(
      "",
      "🚫 <b><u>REASON</u></b>",
      `<blockquote>${escapeHtml(alert.note.trim())}</blockquote>`,
    );
  } else {
    lines.push("", "🚫 <b>Reason:</b> <i>No note provided</i>");
  }
  if (alert.adminUrl) {
    lines.push("", `➡️ <a href="${escapeHtml(alert.adminUrl)}">Open admin dashboard</a>`);
  }
  return lines.join("\n");
}

function formatApprovedMessage(alert: TelegramBookingAlert) {
  const lines = [
    "🟩🟩🟩🟩🟩🟩🟩🟩",
    "✅ <b><u>BOOKING APPROVED</u></b> ✅",
    "🟩🟩🟩🟩🟩🟩🟩🟩",
    "",
    "<blockquote>Reservation confirmed — ready for fulfilment</blockquote>",
    "",
    ...guestLines(alert),
  ];
  if (alert.note?.trim()) {
    lines.push(
      "",
      "📝 <b><u>ADMIN NOTE</u></b>",
      `<blockquote>${escapeHtml(alert.note.trim())}</blockquote>`,
    );
  }
  if (alert.adminUrl) {
    lines.push("", `➡️ <a href="${escapeHtml(alert.adminUrl)}">Open admin dashboard</a>`);
  }
  return lines.join("\n");
}

function formatReminderMessage(
  alert: TelegramBookingAlert,
  kind: "day-before" | "day-of",
) {
  const isDayOf = kind === "day-of";
  const lines = isDayOf
    ? [
        "🟧🟧🟧🟧🟧🟧🟧🟧",
        "🔔 <b><u>NEXORA BOOKING REMINDERS</u></b> 🔔",
        "🗓️ <b><u>TODAY — SCHEDULED BOOKING TO WORK ON</u></b> 🗓️",
        "🟧🟧🟧🟧🟧🟧🟧🟧",
        "",
        "<blockquote>Approved booking is scheduled today — start fulfilment now</blockquote>",
      ]
    : [
        "🟨🟨🟨🟨🟨🟨🟨🟨",
        "🔔 <b><u>NEXORA BOOKING REMINDERS</u></b> 🔔",
        "⏰ <b><u>TOMORROW — 1 DAY BEFORE SCHEDULE</u></b> ⏰",
        "🟨🟨🟨🟨🟨🟨🟨🟨",
        "",
        "<blockquote>Approved booking is tomorrow — prepare staff, inventory, and logistics</blockquote>",
      ];
  lines.push("", ...guestLines(alert));
  if (alert.note?.trim()) {
    lines.push(
      "",
      "📝 <b><u>ADMIN NOTE</u></b>",
      `<blockquote>${escapeHtml(alert.note.trim())}</blockquote>`,
    );
  }
  if (alert.adminUrl) {
    lines.push("", `➡️ <a href="${escapeHtml(alert.adminUrl)}">Open admin dashboard</a>`);
  }
  return lines.join("\n");
}

/** Send an HTML message to a specific Telegram chat (or the main admin group). */
export async function sendTelegramMessage(
  text: string,
  targetChatId?: string | null,
): Promise<{ ok: boolean }> {
  const token = botToken();
  const chat = (targetChatId || mainChatId() || "").trim();
  if (!token || !chat) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN or chat id is not set — skipped");
    return { ok: false };
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chat,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram [${res.status}] ${body}`);
  }
  return { ok: true };
}

export async function notifyAdminsNewBookingTelegram(alert: TelegramBookingAlert) {
  return sendTelegramMessage(formatBookingMessage(alert), mainChatId());
}

export async function notifyAdminsBookingRejectedTelegram(alert: TelegramBookingAlert) {
  return sendTelegramMessage(formatRejectedMessage(alert), mainChatId());
}

export async function notifyAdminsBookingApprovedTelegram(alert: TelegramBookingAlert) {
  const chat = approvedChatId();
  if (!chat) {
    console.warn("[telegram] TELEGRAM_APPROVED_CHAT_ID is not set — approved alert skipped");
    return { ok: false };
  }
  return sendTelegramMessage(formatApprovedMessage(alert), chat);
}

export async function notifyBookingReminderTelegram(
  alert: TelegramBookingAlert,
  kind: "day-before" | "day-of",
) {
  const chat = reminderChatId();
  if (!chat) {
    console.warn("[telegram] TELEGRAM_REMINDER_CHAT_ID is not set — reminder skipped");
    return { ok: false };
  }
  return sendTelegramMessage(formatReminderMessage(alert, kind), chat);
}

/** Never fail the parent booking action if Telegram is down. */
export async function deliverTelegramSafely(
  label: string,
  task: () => Promise<{ ok: boolean } | unknown>,
): Promise<boolean> {
  const run = (async () => {
    try {
      const result = await task();
      if (result && typeof result === "object" && "ok" in result) {
        return Boolean((result as { ok: boolean }).ok);
      }
      return true;
    } catch (error) {
      console.error(`[telegram] ${label} failed`, error);
      return false;
    }
  })();
  keepAlive(run);
  return run;
}
