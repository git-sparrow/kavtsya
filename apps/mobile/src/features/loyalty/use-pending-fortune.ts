import type { PendingFortune } from "@kavtsya/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { fetchPendingFortune, markFortuneSeen } from "@/lib/api";

/** How often to check for a fresh reveal while none is showing. */
const POLL_MS = 4000;

/**
 * Watches for the Customer's Ворожка reveal (#23, turn 1). The ritual now lives
 * on the Customer's device: while the home is mounted this polls for the most
 * recent unrevealed fortune, so it appears shortly after the CafeOwner scans
 * (the Customer is holding their QR up — the natural moment). Polling pauses
 * while a reveal is showing and resumes after `dismiss`. A poll failure is
 * silent — the next tick retries.
 *
 * «Дякую» is deliberately optimistic: the card closes at once and the seen-write
 * travels afterwards, because making the Customer watch a spinner to put a
 * fortune away would be worse than the write being a moment late. That leaves a
 * window this hook has to own, and did not: resuming the poll immediately raced
 * the un-awaited write, the fetch won, the server still read `seen_at is null`,
 * and the *same* fortune revealed a second time (measured at ~54ms against an
 * ~83ms write).
 *
 * So a dismissal is remembered here the instant it happens, and a fortune this
 * device has already dismissed is never revealed again — which also covers the
 * seen-write failing outright, where re-revealing would otherwise loop for as
 * long as the screen stayed open. The set holds one short id per dismissal and
 * lives only as long as the screen.
 */
export function usePendingFortune(): {
  fortune: PendingFortune | null;
  dismiss: () => void;
} {
  const [fortune, setFortune] = useState<PendingFortune | null>(null);
  // What «Дякую» has closed on this device, whether or not the server knows yet.
  const dismissed = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (fortune) return; // one is showing — hold until dismissed
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const next = await fetchPendingFortune();
        // A fortune already dismissed here is not news, however the server
        // still has it recorded — fall through and try again on the next tick.
        if (active && next && !dismissed.current.has(next.id)) {
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
    // Recorded BEFORE the state clear that restarts the poll — the whole point
    // is that the very next fetch already knows this one is closed.
    if (id) dismissed.current.add(id);
    setFortune(null);
    if (id) void markFortuneSeen(id).catch(() => {});
  }, [fortune]);

  return { fortune, dismiss };
}
