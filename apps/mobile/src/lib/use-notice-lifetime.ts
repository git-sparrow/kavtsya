import { useCallback, useEffect, useRef } from "react";

/**
 * How long a floating notice stays on screen.
 *
 * - `transient` — informational, leaves on its own after a few seconds
 *   («зміну завершено»: the Mode already changed; this only says why).
 * - `persistent` — stays until acted on or dismissed (a failed check). An error
 *   never auto-dismisses: the reader is a barista glancing between orders.
 */
export type NoticeLifetime = "transient" | "persistent";

/** How long a transient notice stays before it leaves by itself. */
export const TRANSIENT_NOTICE_MS = 5000;

/**
 * When a floating notice leaves, and that it leaves exactly once.
 *
 * Returns `dismiss`, for the ✕. A transient notice also calls it itself after
 * `TRANSIENT_NOTICE_MS`. Either way `exit` runs once — the timeout and a tap
 * landing together must not start the exit twice — and `onDismiss` is called
 * only when `exit` reports it finished, so the caller's state outlives the exit
 * animation that is still showing it.
 *
 * The countdown starts on mount and only then: `onDismiss` and `exit` are read
 * through refs, so a caller re-rendering with fresh callbacks neither restarts
 * it nor gets its stale callback called.
 *
 * A dismissal belongs to the mount that started it. If the notice unmounts
 * while its exit is still running — replaced by a different message, which the
 * banner remounts for — the exit finishing is dropped rather than dismissing
 * whatever the caller is showing by then.
 */
export function useNoticeLifetime({
  lifetime,
  onDismiss,
  exit,
}: {
  lifetime: NoticeLifetime;
  onDismiss: () => void;
  exit: (done: () => void) => void;
}): () => void {
  const leaving = useRef(false);
  const mounted = useRef(true);
  const latest = useRef({ onDismiss, exit });
  useEffect(() => {
    latest.current = { onDismiss, exit };
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const dismiss = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    latest.current.exit(() => {
      if (mounted.current) latest.current.onDismiss();
    });
  }, []);

  useEffect(() => {
    if (lifetime !== "transient") return;
    const timer = setTimeout(dismiss, TRANSIENT_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [lifetime, dismiss]);

  return dismiss;
}
