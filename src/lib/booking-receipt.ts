import QRCode from "qrcode";

import {
  bookingDurationLabel,
  bookingEndYmd,
  bookingStartYmd,
  formatDateTime,
  PACKAGE_BILLING_LABELS,
  PRICING_TYPE_LABELS,
  resolvePackageBilling,
} from "@/lib/booking-model";
import { bookingConfirmationUrl } from "@/lib/booking-url";
import type { Booking, HubSettings } from "@/lib/types";
import { peso } from "@/lib/utils";

const STATUS_LABELS: Partial<Record<Booking["status"], string>> = {
  pending: "Pending admin approval",
  approved: "Approved — payment required to finalize",
  confirmed: "Confirmed",
  completed: "Completed",
  partial_payment: "Partially paid — balance to be settled",
  completed_payment: "Fully paid",
  cancelled: "Cancelled",
  rejected: "Declined",
};

export function bookingStatusLabel(status: Booking["status"]) {
  return STATUS_LABELS[status] ?? status;
}

export async function generateBookingQrDataUrl(reference: string) {
  return QRCode.toDataURL(bookingConfirmationUrl(reference), {
    width: 256,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#0b2b2b", light: "#ffffff" },
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
  return cy;
}

function drawCenteredLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  centerX: number,
  y: number,
  lineHeight: number,
) {
  let cy = y;
  for (const line of lines) {
    ctx.fillText(line, centerX, cy);
    cy += lineHeight;
  }
  return cy;
}

function splitUrlLines(url: string, maxChars = 42) {
  const plain = url.replace(/^https?:\/\//, "");
  if (plain.length <= maxChars) return [plain];
  const parts: string[] = [];
  let rest = plain;
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf("/", maxChars);
    if (cut < maxChars * 0.4) cut = maxChars;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) parts.push(rest);
  return parts;
}

export async function downloadBookingReceipt(
  booking: Booking,
  options: { qrDataUrl: string; settings?: HubSettings },
) {
  const width = 400;
  const height = 780;
  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create receipt");

  ctx.scale(2, 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#0b2b2b";
  ctx.fillRect(0, 0, width, 52);
  ctx.fillStyle = "#c9a96e";
  ctx.font = "600 17px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("NEXORA", 20, 32);
  ctx.fillStyle = "#e8f0f0";
  ctx.font = "12px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("Palawan travel receipt", 20, 46);

  ctx.fillStyle = "#0b2b2b";
  ctx.font = "700 20px ui-monospace, monospace";
  ctx.fillText(booking.reference, 20, 84);

  ctx.strokeStyle = "#e5e7eb";
  ctx.beginPath();
  ctx.moveTo(20, 96);
  ctx.lineTo(width - 20, 96);
  ctx.stroke();

  const start = formatDateTime(bookingStartYmd(booking), booking.startTime) || booking.date;
  const end = formatDateTime(bookingEndYmd(booking), booking.endTime) || start;
  const rows: [string, string][] = [["Listing", booking.listingTitle]];
  if (booking.packageNameSnapshot) {
    const billing = resolvePackageBilling(booking.packageSnapshot);
    const unitBit =
      booking.packagePriceSnapshot != null
        ? ` · ${peso(booking.packagePriceSnapshot)} ${PACKAGE_BILLING_LABELS[billing].toLowerCase()}`
        : "";
    rows.push(["Package tier", `${booking.packageNameSnapshot}${unitBit}`]);
  }
  rows.push(
    ["Start", start],
    ["End", end],
    ["Duration", bookingDurationLabel(booking)],
    ["Guests", String(booking.guests)],
  );
  if (booking.pricingType === "per_package" && booking.packageSnapshot) {
    rows.push(["Billing", PACKAGE_BILLING_LABELS[resolvePackageBilling(booking.packageSnapshot)]]);
  } else if (booking.pricingType) {
    rows.push(["Pricing", PRICING_TYPE_LABELS[booking.pricingType]]);
  }
  rows.push(
    ["Guest", booking.customer],
    ["Total", peso(booking.total)],
    ["Payment", booking.paid ? "Paid" : "Pay on arrival"],
    ["Status", bookingStatusLabel(booking.status)],
  );

  const labelX = 20;
  const valueX = 118;
  const valueMaxWidth = width - valueX - 20;

  ctx.font = "13px 'Segoe UI', system-ui, sans-serif";
  let y = 118;
  for (const [label, value] of rows) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#64748b";
    ctx.font = "13px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(label, labelX, y);
    ctx.fillStyle = "#0b2b2b";
    ctx.font = "600 13px 'Segoe UI', system-ui, sans-serif";
    const endY = wrapText(ctx, value, valueX, y, valueMaxWidth, 16);
    y = endY + 22;
  }

  const qr = await loadImage(options.qrDataUrl);
  const qrSize = 108;
  const qrX = (width - qrSize) / 2;
  const qrY = Math.max(y + 12, height - 210);
  ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);

  ctx.fillStyle = "#64748b";
  ctx.font = "11px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = "center";
  let footerY = qrY + qrSize + 18;
  footerY = drawCenteredLines(
    ctx,
    ["Scan to view this reservation online"],
    width / 2,
    footerY,
    14,
  );

  const confirmUrl = bookingConfirmationUrl(booking.reference);
  ctx.font = "9px ui-monospace, monospace";
  footerY = drawCenteredLines(ctx, splitUrlLines(confirmUrl), width / 2, footerY + 2, 12);

  if (options.settings?.contactPhone) {
    ctx.font = "11px 'Segoe UI', system-ui, sans-serif";
    footerY = drawCenteredLines(
      ctx,
      [`Follow up: ${options.settings.contactPhone}`],
      width / 2,
      footerY + 4,
      14,
    );
  }
  ctx.textAlign = "left";

  const stamp = new Date().toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText(`Generated ${stamp}`, 20, height - 12);

  await new Promise<void>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not create receipt image"));
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = `nexora-${booking.reference}.png`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        resolve();
      },
      "image/png",
      1,
    );
  });
}
