import { useEffect, useState } from "react";

import { fetchQrToken } from "@/lib/api";

/** Refetch this many ms before the token's nominal expiry, so it never goes stale on screen. */
const REFRESH_LEAD_MS = 15_000;
/** Floor on the refetch delay, so a near-expired or clock-skewed token can't busy-loop. */
const MIN_REFRESH_MS = 5_000;

/**
 * Holds the Customer's rotating QR token (ADR 0006) fresh on screen: fetches one
 * on mount and schedules the next fetch shortly before the current token's
 * `expiresAt` (≈60s in practice), so the displayed code always validates. The
 * server is the only authority on token contents — this just displays and
 * rotates them. Returns the current `token`, an `error` string, and `reload`
 * (which restarts the loop immediately, e.g. from a retry button).
 */
export function useQrToken() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Fetch, then arm the next fetch just before this token expires. A failure
    // retries on the floor delay rather than giving up — the QR is the
    // Customer's only way to earn, so it should self-heal once back online.
    async function refresh() {
      try {
        const { token: next, expiresAt } = await fetchQrToken();
        if (!active) return;
        setToken(next);
        setError(null);
        const msUntilExpiry = new Date(expiresAt).getTime() - Date.now();
        const delay = Math.max(MIN_REFRESH_MS, msUntilExpiry - REFRESH_LEAD_MS);
        timer = setTimeout(() => void refresh(), delay);
      } catch (e) {
        if (!active) return;
        // Drop the old token: it may already be past its grace window, and a
        // stale QR that still scans-as-rejected is worse than showing the error
        // and retrying. The loop self-heals once the network is back.
        setToken(null);
        setError(e instanceof Error ? e.message : "Не вдалося оновити QR-код");
        timer = setTimeout(() => void refresh(), MIN_REFRESH_MS);
      }
    }

    void refresh();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [reloadKey]);

  return { token, error, reload: () => setReloadKey((k) => k + 1) };
}
