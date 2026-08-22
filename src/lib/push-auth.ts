/**
 * Auth ↔ OneSignal glue (browser). Banner UI is handled by PushSubscribeBanner.
 */
import type { PushRole } from "@/lib/onesignal";
import {
  clearPushPromptAsked,
  identifyPushUser,
  logoutPushUser,
  requestPushBannerShow,
  shouldShowPushBanner,
} from "@/lib/onesignal-web";

export type PushAuthUser = {
  email: string;
  role: "tourist" | "admin";
};

function pushRole(role: PushAuthUser["role"]): PushRole {
  return role === "admin" ? "admin" : "tourist";
}

/**
 * After auth: quietly link OneSignal identity.
 * New accounts clear the dismiss flag so the subscribe banner can appear once.
 */
export function syncPushAfterAuth(
  user: PushAuthUser,
  opts?: { isNewAccount?: boolean },
) {
  if (typeof window === "undefined") return;
  if (opts?.isNewAccount) {
    clearPushPromptAsked(user.email);
  }
  void identifyPushUser(user.email, pushRole(user.role)).catch(() => undefined);
  // After React navigates / auth settles, open the in-app banner once if needed.
  window.setTimeout(() => {
    if (shouldShowPushBanner(user.email)) requestPushBannerShow();
  }, 600);
}

/** Session restore — identify only (banner decides visibility). */
export function identifyPushSession(user: PushAuthUser) {
  if (typeof window === "undefined") return;
  void identifyPushUser(user.email, pushRole(user.role)).catch(() => undefined);
}

export function logoutPushSession() {
  if (typeof window === "undefined") return;
  void logoutPushUser();
}
