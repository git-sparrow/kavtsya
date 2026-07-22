import type { PendingFortune } from "@kavtsya/shared";
import { useCallback, useEffect, useState } from "react";

import { fetchPendingFortune, markFortuneSeen } from "@/lib/api";

/** How often to check for a fresh reveal while none is showing. */
const POLL_MS = 4000;

/**
 * Watches for the Customer's Ворожка reveal (#23, turn 1). The ritual now lives
 * on the Customer's device: while the home is mounted this polls for the most
 * recent unrevealed fortune, so it appears shortly after the CafeOwner scans
 * (the Customer is holding their QR up — the natural moment). Polling pauses
 * while a reveal is showing and resumes after `dismiss`, which marks it seen so
 * it never returns. A poll failure is silent — the next tick retries.
 */
export function usePendingFortune(): {
  fortune: PendingFortune | null;
  dismiss: () => void;
} {
  const [fortune, setFortune] = useState<PendingFortune | null>(null);

  useEffect(() => {
    if (fortune) return; // one is showing — hold until dismissed
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const next = await fetchPendingFortune();
        if (active && next) {
          setFortune(next); // stop polling; the effect re-runs and pauses
          return;
        }
      } catch {
        // Transient — fall through to reschedule.
      }
      if (active) timer = setTimeout(() => void poll(), POLL_MS);
    }

    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [fortune]);

  const dismiss = useCallback(() => {
    const id = fortune?.id;
    setFortune(null);
    if (id) void markFortuneSeen(id).catch(() => {});
  }, [fortune]);

  return { fortune, dismiss };
}
