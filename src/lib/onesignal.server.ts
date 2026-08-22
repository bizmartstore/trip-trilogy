/**
 * OneSignal REST helpers (server-only).
 * Booking/status/broadcast pushes must never throw — failures are logged and retried via keepalive.
 */
import { ONESIGNAL_APP_ID } from "@/lib/onesignal";
import { firstEnv, keepAlive, syncEnvFromGlobal } from "@/lib/worker-env";
import { normalizeEmail } from "@/lib/constants";

/** OneSignal allows up to 20k aliases; keep batches smaller for Worker reliability. */
const EMAIL_CHUNK = 500;

function restApiKey() {
  syncEnvFromGlobal();
  return firstEnv("ONESIGNAL_REST_API_KEY", "ONESIGNAL_API_KEY");
}

function appId() {
  return firstEnv("ONESIGNAL_APP_ID", "VITE_ONESIGNAL_APP_ID") || ONESIGNAL_APP_ID;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  idempotencyKey?: string;
};

export type PushSendResult = {
  ok: boolean;
  recipients: number;
  skipped?: "no-key" | "no-targets";
  error?: string;
  raw?: unknown;
  strategy?: string;
  notificationId?: string | null;
};

function extractRecipients(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const obj = raw as Record<string, unknown>;
  if ("recipients" in obj) return Number(obj.recipients) || 0;
  if (typeof obj.id === "string" && obj.id.length > 0) return 1;
  return 0;
}

function extractErrors(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  if (obj.errors == null) return undefined;
  try {
    const text = typeof obj.errors === "string" ? obj.errors : JSON.stringify(obj.errors);
    return text.length > 240 ? `${text.slice(0, 240)}…` : text;
  } catch {
    return "onesignal-errors";
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * OneSignal requires idempotency_key to be an RFC UUID.
 * Semantic seeds are hashed into a stable UUID so retries still dedupe.
 */
export function pushIdempotencyKey(seed?: string): string {
  if (seed && UUID_RE.test(seed.trim())) return seed.trim().toLowerCase();
  if (!seed) return crypto.randomUUID();

  const bytes = new Uint8Array(16);
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
    bytes[i % 16] ^= (h >>> (i % 24)) & 0xff;
    bytes[(i * 7) % 16] ^= seed.charCodeAt(i) & 0xff;
  }
  for (let i = 0; i < 16; i += 1) {
    bytes[i] ^= (seed.length * (i + 1) + h) & 0xff;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function postNotification(
  body: Record<string, unknown>,
  strategy: string,
  attempt = 1,
): Promise<PushSendResult> {
  const key = restApiKey();
  if (!key) {
    console.warn("[onesignal] ONESIGNAL_REST_API_KEY is not set — push skipped");
    return { ok: false, recipients: 0, skipped: "no-key", strategy };
  }

  const payload = {
    app_id: appId(),
    target_channel: "push",
    ...body,
  };

  const attemptFetch = async (url: string, authorization: string) =>
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify(payload),
    });

  try {
    let res = await attemptFetch("https://api.onesignal.com/notifications?c=push", `Key ${key}`);
    if (res.status === 401 || res.status === 403) {
      res = await attemptFetch("https://api.onesignal.com/notifications", `Key ${key}`);
    }
    if (res.status === 401 || res.status === 403) {
      res = await attemptFetch("https://api.onesignal.com/notifications", `Basic ${btoa(`${key}:`)}`);
    }

    // Transient OneSignal / network pressure — one retry keeps booking volume from dropping pushes.
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await sleep(400 * attempt);
      return postNotification(body, strategy, attempt + 1);
    }

    const text = await res.text();
    let raw: unknown = null;
    try {
      raw = text ? JSON.parse(text) : null;
    } catch {
      raw = text;
    }

    if (!res.ok) {
      console.error("[onesignal] send failed", strategy, res.status, text.slice(0, 400));
      return {
        ok: false,
        recipients: 0,
        error: extractErrors(raw) || `HTTP ${res.status}`,
        strategy,
      };
    }

    const recipients = extractRecipients(raw);
    const notificationId =
      raw && typeof raw === "object" && typeof (raw as { id?: unknown }).id === "string"
        ? ((raw as { id: string }).id || null)
        : null;
    const error = recipients === 0 ? extractErrors(raw) || "no-subscribed-devices" : undefined;

    if (recipients === 0) {
      console.warn("[onesignal] 0 recipients", strategy, error);
    } else {
      console.info("[onesignal] sent", strategy, "recipients=", recipients, "id=", notificationId);
    }
    return {
      ok: recipients > 0,
      recipients,
      error,
      strategy,
      notificationId,
    };
  } catch (error) {
    if (attempt < 2) {
      await sleep(400 * attempt);
      return postNotification(body, strategy, attempt + 1);
    }
    console.error("[onesignal] send error", strategy, error);
    return {
      ok: false,
      recipients: 0,
      error: error instanceof Error ? error.message : "send-error",
      strategy,
    };
  }
}

function baseMessage(payload: PushPayload) {
  const msg: Record<string, unknown> = {
    headings: { en: payload.title.slice(0, 65) },
    contents: { en: payload.body.slice(0, 280) },
  };
  if (payload.url) msg.url = payload.url;
  if (payload.idempotencyKey) {
    msg.idempotency_key = pushIdempotencyKey(payload.idempotencyKey);
  }
  return msg;
}

function uniqueEmails(emails: string[]) {
  return [...new Set(emails.map(normalizeEmail).filter((e) => e.includes("@")))];
}

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length <= size) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function sendPushToEmailChunk(
  externalIds: string[],
  payload: PushPayload,
  chunkIndex: number,
): Promise<PushSendResult> {
  const seed = payload.idempotencyKey
    ? `${payload.idempotencyKey}|chunk-${chunkIndex}`
    : undefined;
  const msg = {
    ...baseMessage({ ...payload, idempotencyKey: seed }),
    include_aliases: { external_id: externalIds },
  };

  const byAlias = await postNotification(msg, `aliases:chunk-${chunkIndex}`);
  if (byAlias.recipients > 0) return byAlias;

  const byLegacy = await postNotification(
    {
      ...baseMessage({ ...payload, idempotencyKey: seed ? `${seed}|legacy` : undefined }),
      include_external_user_ids: externalIds,
      channel_for_external_user_ids: "push",
    },
    `external_user_ids:chunk-${chunkIndex}`,
  );
  if (byLegacy.recipients > 0) return byLegacy;

  return {
    ok: false,
    recipients: 0,
    error: byAlias.error || byLegacy.error || "no-subscribed-devices",
    strategy: `aliases+legacy:chunk-${chunkIndex}`,
  };
}

/** One push to users by External ID (= account email). Chunks large lists safely. */
export async function sendPushToEmails(
  emails: string[],
  payload: PushPayload,
): Promise<PushSendResult> {
  const externalIds = uniqueEmails(emails);
  if (!externalIds.length) return { ok: false, recipients: 0, skipped: "no-targets" };

  const parts = chunk(externalIds, EMAIL_CHUNK);
  let recipients = 0;
  let last: PushSendResult | null = null;
  let anyOk = false;

  for (let i = 0; i < parts.length; i += 1) {
    last = await sendPushToEmailChunk(parts[i]!, payload, i);
    recipients += last.recipients;
    if (last.ok) anyOk = true;
  }

  return {
    ok: anyOk,
    recipients,
    error: anyOk ? undefined : last?.error,
    strategy: parts.length > 1 ? `aliases:chunks-${parts.length}` : last?.strategy || "aliases",
    notificationId: last?.notificationId ?? null,
  };
}

export async function sendPushToRole(
  role: "tourist" | "admin",
  payload: PushPayload,
): Promise<PushSendResult> {
  return postNotification(
    {
      ...baseMessage(payload),
      filters: [{ field: "tag", key: "role", relation: "=", value: role }],
    },
    `role:${role}`,
  );
}

/**
 * Promotional / Messages tab:
 * - single email → that External ID only
 * - otherwise → all subscribed devices tagged role=tourist
 */
export async function sendPushBroadcast(options: {
  title: string;
  body: string;
  url: string;
  targetEmail?: string;
  touristEmails?: string[];
  broadcastId: string;
}): Promise<PushSendResult & { mode: "single" | "all-tourists" }> {
  const single = options.targetEmail ? normalizeEmail(options.targetEmail) : "";
  if (single.includes("@")) {
    const result = await sendPushToEmails([single], {
      title: options.title,
      body: options.body,
      url: options.url,
      idempotencyKey: `promo-single|${options.broadcastId}|${single}`,
    });
    return { ...result, mode: "single" };
  }

  // Primary: every subscribed Web Push device with tag role=tourist (PWA + desktop).
  const byRole = await sendPushToRole("tourist", {
    title: options.title,
    body: options.body,
    url: options.url,
    idempotencyKey: `promo-role|${options.broadcastId}`,
  });
  if (byRole.recipients > 0) {
    return { ...byRole, mode: "all-tourists" };
  }

  // Fallback only when role filter hit nobody (e.g. missing tags) — avoids double pushes.
  const emails = uniqueEmails(options.touristEmails ?? []);
  if (!emails.length) {
    return { ...byRole, mode: "all-tourists" };
  }
  const byEmail = await sendPushToEmails(emails, {
    title: options.title,
    body: options.body,
    url: options.url,
    idempotencyKey: `promo-emails|${options.broadcastId}`,
  });
  return { ...byEmail, mode: "all-tourists" };
}

/**
 * Notify admins once (no duplicates).
 * Works for guest + registered bookings — does not depend on customer accounts.
 */
export async function sendPushToAdmins(
  adminEmailsList: string[],
  payload: PushPayload,
): Promise<PushSendResult> {
  try {
    const emails = uniqueEmails(adminEmailsList);
    console.info("[onesignal] admin push targets", emails);

    if (emails.length) {
      const byEmail = await sendPushToEmails(emails, payload);
      if (byEmail.recipients > 0) return byEmail;
    }

    const byRole = await sendPushToRole("admin", {
      ...payload,
      idempotencyKey: pushIdempotencyKey(
        payload.idempotencyKey ? `${payload.idempotencyKey}|role` : undefined,
      ),
    });
    if (byRole.recipients > 0) return byRole;

    let singleRecipients = 0;
    let lastSingle: PushSendResult | null = null;
    for (const email of emails) {
      const one = await sendPushToEmails([email], {
        ...payload,
        idempotencyKey: pushIdempotencyKey(
          payload.idempotencyKey
            ? `${payload.idempotencyKey}|${email}`
            : `admin-single|${email}`,
        ),
      });
      lastSingle = one;
      singleRecipients += one.recipients;
      if (one.recipients > 0) break;
    }
    if (singleRecipients > 0 && lastSingle) {
      return { ...lastSingle, recipients: singleRecipients, strategy: "admins-single" };
    }

    return {
      ok: false,
      recipients: 0,
      error: "no-subscribed-admins",
      strategy: "admins",
    };
  } catch (error) {
    console.error("[onesignal] sendPushToAdmins crashed", error);
    return {
      ok: false,
      recipients: 0,
      error: error instanceof Error ? error.message : "admin-push-crashed",
      strategy: "admins",
    };
  }
}

/** Fire-and-forget push that keeps the Worker alive and never rejects. */
export function queuePush(task: () => Promise<unknown>): Promise<unknown> {
  const run = Promise.resolve()
    .then(task)
    .catch((error) => {
      console.error("[onesignal] queued push failed", error);
      return null;
    });
  keepAlive(run);
  return run;
}

/**
 * Run booking/status pushes without failing the parent action.
 * Awaits the attempt (with keepAlive) so delivery finishes under load when possible.
 */
export async function deliverPushSafely(
  label: string,
  task: () => Promise<PushSendResult | unknown>,
): Promise<PushSendResult | null> {
  const run = (async () => {
    try {
      const result = await task();
      return result && typeof result === "object" && "recipients" in result
        ? (result as PushSendResult)
        : null;
    } catch (error) {
      console.error(`[onesignal] ${label} failed`, error);
      return null;
    }
  })();
  keepAlive(run);
  return run;
}

export function siteOriginFromRequest(request?: Request) {
  if (request?.url) {
    try {
      return new URL(request.url).origin;
    } catch {
      // fall through
    }
  }
  return (
    firstEnv("NEXORA_WORKER_URL", "VITE_APP_URL") ||
    "https://trip-trilogy.sheethappenswithjaa.workers.dev"
  );
}

export function absoluteUrl(path: string, origin?: string) {
  const base = (origin || siteOriginFromRequest()).replace(/\/$/, "");
  if (!path) return base;
  return path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function queuePushToEmail(email: string, payload: PushPayload) {
  return queuePush(() => sendPushToEmails([email], payload));
}

export function queuePushToEmails(emails: string[], payload: PushPayload) {
  return queuePush(() => sendPushToEmails(emails, payload));
}

export function queuePushToRole(role: "tourist" | "admin", payload: PushPayload) {
  return queuePush(() => sendPushToRole(role, payload));
}

export function queuePushToAdmins(adminEmailsList: string[], payload: PushPayload) {
  return queuePush(() => sendPushToAdmins(adminEmailsList, payload));
}

export function onesignalKeyStatus() {
  syncEnvFromGlobal();
  return {
    hasRestApiKey: Boolean(firstEnv("ONESIGNAL_REST_API_KEY", "ONESIGNAL_API_KEY")),
    appIdConfigured: Boolean(appId()),
  };
}
