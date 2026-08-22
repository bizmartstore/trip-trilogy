/**
 * Browser OneSignal helpers — single subscribe path (PushSubscribeBanner only).
 *
 * Correct order (OneSignal Web SDK v16):
 *   init → login(email) → requestPermission() → optIn() if needed → wait for subscription id
 *
 * Calling requestPermission() BEFORE login attaches the push token to an anonymous user.
 * login() then switches to the External ID user and discards anonymous data — dashboard
 * shows External ID + tags but no Subscribed Web Push channel → API returns 0 recipients.
 *
 * Quiet identify (every session) may show a single "Not Subscribed" row until Subscribe;
 * that is normal. Do not call optIn() except inside acceptPushSubscribe.
 */
import { ONESIGNAL_APP_ID, type PushRole } from "@/lib/onesignal";
import { normalizeEmail } from "@/lib/constants";

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: OneSignalApi) => void | Promise<void>>;
    OneSignal?: OneSignalApi;
  }
}

type PushSubscriptionApi = {
  id?: string | null;
  token?: string | null;
  optedIn?: boolean;
  optIn?: () => Promise<void> | void;
  optOut?: () => Promise<void> | void;
};

type OneSignalApi = {
  init: (options: Record<string, unknown>) => Promise<void>;
  login: (externalId: string) => Promise<void>;
  logout: () => Promise<void>;
  User?: {
    externalId?: string | null;
    onesignalId?: string | null;
    addTags?: (tags: Record<string, string>) => void;
    PushSubscription?: PushSubscriptionApi;
  };
  Notifications?: {
    permissionNative?: string;
    permission?: boolean;
    isPushSupported?: () => boolean;
    requestPermission?: (fallbackToSettings?: boolean) => Promise<boolean>;
  };
};

let initPromise: Promise<void> | null = null;
let scriptLoaded = false;
let identityChain: Promise<void> = Promise.resolve();
let lastExternalId: string | null = null;

const ASKED_KEY = "nexora_onesignal_asked_v6";
const RESET_KEY = "nexora_onesignal_hard_reset_v6";
const SHOW_BANNER_EVENT = "nexora-show-push-banner";
const BANNER_VISIBILITY_EVENT = "nexora-push-banner-visibility";

const KNOWN_ONESIGNAL_DBS = [
  "ONE_SIGNAL_SDK_DB",
  "ONE_SIGNAL_SDK_DB_WORKER",
  "OneSignalSDK",
  "onesignal-sdk",
];

function loadScript() {
  if (scriptLoaded || typeof document === "undefined") return;
  if (document.querySelector("script[data-onesignal]")) {
    scriptLoaded = true;
    return;
  }
  const s = document.createElement("script");
  s.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
  s.defer = true;
  s.dataset.onesignal = "true";
  document.head.appendChild(s);
  scriptLoaded = true;
}

function withOneSignal<T>(fn: (OneSignal: OneSignalApi) => Promise<T> | T): Promise<T> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("OneSignal is browser-only"));
  }
  loadScript();
  return new Promise((resolve, reject) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        resolve(await fn(OneSignal));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function hideOneSignalBell() {
  if (typeof document === "undefined") return;
  if (document.getElementById("nexora-hide-onesignal-bell")) return;
  const style = document.createElement("style");
  style.id = "nexora-hide-onesignal-bell";
  style.textContent = `
    #onesignal-bell-container,
    .onesignal-bell-launcher,
    .onesignal-bell-launcher-button,
    .onesignal-bell-launcher-dialog,
    [id^="onesignal-bell"],
    .onesignal-slidedown-container,
    #onesignal-slidedown-container,
    .onesignal-slidedown-dialog,
    #onesignal-popover-container,
    .onesignal-popover-container {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
      opacity: 0 !important;
      height: 0 !important;
      overflow: hidden !important;
    }
  `;
  document.head.appendChild(style);
}

function deleteDb(name: string) {
  return new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

function browserPermissionGranted() {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

/** One-time wipe of broken External-ID-without-subscription state, then reload. */
async function hardResetOneSignalIfNeeded(): Promise<boolean> {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return false;
  if (localStorage.getItem(RESET_KEY) === "1") return false;

  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => undefined)));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => /onesignal|workbox|sw/i.test(k))
          .map((k) => caches.delete(k).catch(() => false)),
      );
    }

    const names = new Set(KNOWN_ONESIGNAL_DBS);
    if (typeof indexedDB.databases === "function") {
      for (const db of await indexedDB.databases()) {
        if (db.name && /onesignal/i.test(db.name)) names.add(db.name);
      }
    }
    await Promise.all([...names].map(deleteDb));

    for (const store of [localStorage, sessionStorage]) {
      const doomed: string[] = [];
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (
          key &&
          (/onesignal/i.test(key) ||
            key.startsWith("nexora_onesignal_asked") ||
            key.startsWith("nexora_onesignal_hard_reset"))
        ) {
          doomed.push(key);
        }
      }
      for (const key of doomed) store.removeItem(key);
    }
  } catch {
    // still mark reset
  }

  localStorage.setItem(RESET_KEY, "1");
  window.location.reload();
  return true;
}

export function initOneSignal() {
  if (typeof window === "undefined") return Promise.resolve();
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (await hardResetOneSignalIfNeeded()) return;

    await withOneSignal(async (OneSignal) => {
      await OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        allowLocalhostAsSecureOrigin: true,
        autoResubscribe: true,
        serviceWorkerPath: "OneSignalSDKWorker.js",
        serviceWorkerParam: { scope: "/" },
        notifyButton: { enable: false },
        welcomeNotification: { disable: true },
        promptOptions: { slidedown: { prompts: [] } },
      });
      hideOneSignalBell();
    });
  })().catch((error) => {
    initPromise = null;
    throw error;
  });
  return initPromise;
}

function askedSet(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(ASKED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function markPushPromptAsked(email: string) {
  if (typeof localStorage === "undefined") return;
  const set = askedSet();
  set.add(normalizeEmail(email));
  try {
    localStorage.setItem(ASKED_KEY, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

export function wasPushPromptAsked(email: string) {
  return askedSet().has(normalizeEmail(email));
}

export function clearPushPromptAsked(email?: string) {
  if (typeof localStorage === "undefined") return;
  if (!email) {
    localStorage.removeItem(ASKED_KEY);
    return;
  }
  const set = askedSet();
  set.delete(normalizeEmail(email));
  localStorage.setItem(ASKED_KEY, JSON.stringify([...set]));
}

export function isPushOptedIn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.OneSignal?.User?.PushSubscription?.optedIn);
  } catch {
    return false;
  }
}

export function getPushSubscriptionSnapshot() {
  if (typeof window === "undefined") {
    return { optedIn: false, subscriptionId: null as string | null, externalId: null as string | null };
  }
  try {
    const sub = window.OneSignal?.User?.PushSubscription;
    return {
      optedIn: Boolean(sub?.optedIn),
      subscriptionId: sub?.id ? String(sub.id) : null,
      externalId: window.OneSignal?.User?.externalId
        ? String(window.OneSignal.User.externalId)
        : null,
      onesignalId: window.OneSignal?.User?.onesignalId
        ? String(window.OneSignal.User.onesignalId)
        : null,
      permission:
        typeof Notification !== "undefined" ? Notification.permission : "unsupported",
    };
  } catch {
    return { optedIn: false, subscriptionId: null, externalId: null, onesignalId: null, permission: "error" };
  }
}

export function shouldShowPushBanner(email: string): boolean {
  if (typeof window === "undefined") return false;
  const id = normalizeEmail(email);
  if (!id.includes("@")) return false;
  if (wasPushPromptAsked(id)) return false;
  if (typeof Notification !== "undefined" && Notification.permission === "denied") return false;
  if (isPushOptedIn() && getPushSubscriptionSnapshot().subscriptionId) return false;
  return true;
}

export function requestPushBannerShow() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SHOW_BANNER_EVENT));
}

export function onPushBannerShowRequest(handler: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(SHOW_BANNER_EVENT, handler);
  return () => window.removeEventListener(SHOW_BANNER_EVENT, handler);
}

/** Lets InstallAppBanner hide while the push subscribe UI is open (one prompt at a time). */
export function setPushBannerVisible(visible: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(BANNER_VISIBILITY_EVENT, { detail: { visible } }),
  );
}

export function onPushBannerVisibility(handler: (visible: boolean) => void) {
  if (typeof window === "undefined") return () => undefined;
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ visible?: boolean }>).detail;
    handler(Boolean(detail?.visible));
  };
  window.addEventListener(BANNER_VISIBILITY_EVENT, listener);
  return () => window.removeEventListener(BANNER_VISIBILITY_EVENT, listener);
}

async function loginAndTag(OneSignal: OneSignalApi, id: string, role: PushRole) {
  const current = OneSignal.User?.externalId ?? null;
  if (current !== id && lastExternalId !== id) {
    try {
      await OneSignal.login(id);
    } catch {
      // 409 Conflict is expected when External ID already exists
    }
  }
  lastExternalId = id;
  OneSignal.User?.addTags?.({ role, email: id });
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

/** Wait until OneSignal has a real Web Push subscription id on this device. */
async function waitForPushSubscription(
  OneSignal: OneSignalApi,
  timeoutMs = 12000,
): Promise<{ id: string; optedIn: boolean }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const sub = OneSignal.User?.PushSubscription;
    const id = sub?.id ? String(sub.id) : "";
    const optedIn = Boolean(sub?.optedIn);
    const token = sub?.token ? String(sub.token) : "";
    if (id && (optedIn || token)) {
      return { id, optedIn: optedIn || Boolean(token) };
    }
    await sleep(250);
  }
  const sub = OneSignal.User?.PushSubscription;
  return {
    id: sub?.id ? String(sub.id) : "",
    optedIn: Boolean(sub?.optedIn),
  };
}

/**
 * Quiet identity sync after auth (OneSignal recommends login every page load).
 * Does not prompt for permission — Subscribe banner owns that.
 */
export async function identifyPushUser(email: string, role: PushRole) {
  if (typeof window === "undefined") return;
  const id = normalizeEmail(email);
  if (!id.includes("@")) return;

  identityChain = identityChain
    .catch(() => undefined)
    .then(async () => {
      await initOneSignal();
      hideOneSignalBell();
      await withOneSignal(async (OneSignal) => {
        await loginAndTag(OneSignal, id, role);
      });
    });

  await identityChain;
}

/**
 * Single Subscribe action: identify → browser Allow → ensure opted-in subscription.
 */
export async function acceptPushSubscribe(email: string, role: PushRole) {
  const id = normalizeEmail(email);
  await initOneSignal();

  const result = await withOneSignal(async (OneSignal) => {
    hideOneSignalBell();

    if (OneSignal.Notifications?.isPushSupported && !OneSignal.Notifications.isPushSupported()) {
      throw new Error("This browser does not support web push notifications");
    }

    // Login FIRST so the push token attaches to this External ID (not an anonymous user).
    await loginAndTag(OneSignal, id, role);

    const allowed = await OneSignal.Notifications?.requestPermission?.(false);
    const granted =
      allowed === true ||
      browserPermissionGranted() ||
      Boolean(OneSignal.Notifications?.permission);

    if (!granted) {
      throw new Error("Notification permission was not granted");
    }

    // Browser permission alone is not enough — create/activate the Web Push subscription.
    if (!OneSignal.User?.PushSubscription?.optedIn) {
      await OneSignal.User?.PushSubscription?.optIn?.();
    }

    OneSignal.User?.addTags?.({ role, email: id });

    const sub = await waitForPushSubscription(OneSignal);
    if (!sub.id) {
      throw new Error(
        "Push subscription was not created. Allow notifications, stay on this page a few seconds, then try Subscribe again.",
      );
    }

    return {
      ok: true as const,
      subscriptionId: sub.id,
      externalId: id,
      onesignalId: OneSignal.User?.onesignalId ? String(OneSignal.User.onesignalId) : null,
    };
  });

  markPushPromptAsked(id);
  hideOneSignalBell();
  return result;
}

export function dismissPushSubscribe(email: string) {
  markPushPromptAsked(email);
}

/** Force the subscribe banner again (admin self-heal). */
export function resetPushSubscribePrompt(email: string) {
  clearPushPromptAsked(email);
  requestPushBannerShow();
}

/** @deprecated */
export async function promptPushSubscribe(email: string, role: PushRole) {
  await identifyPushUser(email, role).catch(() => undefined);
  return { prompted: false as const, pendingBanner: shouldShowPushBanner(email) };
}

export async function logoutPushUser() {
  if (typeof window === "undefined") return;
  lastExternalId = null;
  try {
    await initOneSignal();
    await withOneSignal(async (OneSignal) => {
      await OneSignal.logout();
    });
  } catch {
    // ignore
  }
}
