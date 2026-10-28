import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { fetchQrToken, fetchQrTokenStatus } from "@/lib/api";

/** Refetch this many ms before the token's nominal expiry, so it never goes stale on screen. */
const REFRESH_LEAD_MS = 15_000;
/** Floor on the refetch delay, so a near-expired or clock-skewed token can't busy-loop. */
const MIN_REFRESH_MS = 5_000;
/** How often to ask whether a scan has used the token on screen (the Ворожка poll's cadence). */
const USED_CHECK_MS = 4_000;

/**
 * Holds the Customer's rotating QR token (ADR 0006) fresh on screen: fetches one
 * on mount and schedules the next fetch shortly before the current token's
 * `expiresAt` (≈75s with the seeded 90s lifetime; both Platform-tunable), so the
 * displayed code always validates. JS timers are suspended while the app is
 * backgrounded, so we also refetch the moment it returns to the foreground —
 * otherwise a resumed app could show a token already past its grace window.
 * Tokens are single-use, so it also asks the server every few seconds whether a
 * scan has used the one on screen and swaps it at once if so (#373) — else the
 * next scan, a second coffee say, is rejected as `token_used`. The server is the
 * only authority on token contents — this just displays and rotates them. Returns the current `token`, an `error` string, and `reload`
 * (which restarts the loop immediately, e.g. from a retry button).
 */
export function useQrToken() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let usedTimer: ReturnType<typeof setTimeout> | undefined;
    // The id of the token on screen, while one is.
    let shownJti: string | undefined;

    // Fetch, then arm the next fetch just before this token expires. A failure
    // retries on the floor delay rather than giving up — the QR is the
    // Customer's only way to earn, so it should self-heal once back online.
    // Cancels any pending timer first, so an out-of-band call (foreground
    // resume) re-arms the schedule instead of running two loops.
    async function refresh() {
      if (timer) clearTimeout(timer);
      try {
        const { token: next, jti, expiresAt } = await fetchQrToken();
        if (!active) return;
        shownJti = jti;
        setToken(next);
        setError(null);
        const msUntilExpiry = new Date(expiresAt).getTime() - Date.now();
        const delay = Math.max(MIN_REFRESH_MS, msUntilExpiry - REFRESH_LEAD_MS);
        timer = setTimeout(() => void refresh(), delay);
      } catch (e) {
        if (!active) return;
        shownJti = undefined;
        // Drop the old token: it may already be past its grace window, and a
        // stale QR that still scans-as-rejected is worse than showing the error
        // and retrying. The loop self-heals once the network is back.
        setToken(null);
        setError(e instanceof Error ? e.message : "Не вдалося оновити QR-код");
        timer = setTimeout(() => void refresh(), MIN_REFRESH_MS);
      }
    }

    // A failed check changes nothing on screen: the expiry timer still rotates
    // the token, and the next tick asks again.
    async function checkUsed() {
      const jti = shownJti;
      if (jti) {
        try {
          const { used } = await fetchQrTokenStatus(jti);
          // Skip if a rotation already replaced the token while we asked.
          if (active && used && jti === shownJti) await refresh();
        } catch {
          // Transient — fall through to reschedule.
        }
      }
      if (active) usedTimer = setTimeout(() => void checkUsed(), USED_CHECK_MS);
    }

    void refresh();
    usedTimer = setTimeout(() => void checkUsed(), USED_CHECK_MS);

    // Force a fresh token when the app returns to the foreground, where the
    // scheduled timer may have been suspended past the token's expiry.
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      if (usedTimer) clearTimeout(usedTimer);
      appStateSub.remove();
    };
  }, [reloadKey]);

  return { token, error, reload: () => setReloadKey((k) => k + 1) };
}
