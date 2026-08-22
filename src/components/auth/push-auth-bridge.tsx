import { useEffect, useRef } from "react";

import { useAuth } from "@/hooks/use-auth";
import { identifyPushSession, logoutPushSession } from "@/lib/push-auth";

/**
 * Quietly keeps OneSignal external_id in sync. The subscribe UI is PushSubscribeBanner.
 */
export function PushAuthBridge() {
  const { user, ready } = useAuth();
  const lastEmail = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (user?.email) {
      lastEmail.current = user.email;
      identifyPushSession(user);
      return;
    }
    if (lastEmail.current) {
      lastEmail.current = null;
      logoutPushSession();
    }
  }, [ready, user?.email, user?.role]);

  return null;
}
