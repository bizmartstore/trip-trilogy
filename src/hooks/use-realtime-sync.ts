import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { fetchRevision, invalidateApiCache } from "@/lib/api";

/**
 * Lightweight realtime: polls a tiny revision integer from the Cloudflare Worker.
 * When content changes, React Query caches are invalidated — no Supabase realtime quota.
 */
export function useRealtimeSync(intervalMs = 4000) {
  const qc = useQueryClient();
  const last = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const { revision } = await fetchRevision();
        if (cancelled) return;
        if (last.current !== null && last.current !== revision) {
          invalidateApiCache();
          await qc.invalidateQueries();
        }
        last.current = revision;
      } catch {
        // Offline / cold start — retry quietly
      } finally {
        if (!cancelled) timer = setTimeout(tick, intervalMs);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [qc, intervalMs]);
}
