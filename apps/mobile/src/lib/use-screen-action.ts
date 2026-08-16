import { useCallback, useState } from "react";

import type { ApiResource } from "./use-api-resource";

/**
 * A screen's own doing, next to what it read (#190).
 *
 * Every screen that both reads something and lets the user act on it has two
 * ways to fail — the read never landed, or the user's tap was refused — and one
 * place to say so. Three screens had each solved that separately (the program
 * editor, the Barista Roster, the Зміна board) with the same two pieces of
 * state and slightly different rules, so this is the fourth derivation made the
 * only one.
 */
export type ScreenAction = {
  /**
   * The single line the screen shows. The user's own action speaks first: they
   * just tapped something, so its refusal is the news, and a background read
   * that also failed can wait its turn.
   */
  error: string | null;
  /** True while `run` is in flight — what disables the controls that start it. */
  busy: boolean;
  /**
   * Perform one of the user's actions. Never rejects: a failure lands in
   * `error` behind the fallback message, so callers can `void` it.
   */
  run: (work: () => Promise<void>, fallback: string) => Promise<void>;
  /**
   * Refuse before anything is attempted — a validation message. Distinct from a
   * failure only in where it comes from; it reads identically to the user.
   */
  refuse: (message: string) => void;
  /**
   * Drop the action error, and stop showing the read error the user has moved
   * past. For a screen whose read happens once: after the CafeOwner starts
   * editing, "не вдалося завантажити" describes a moment they have left behind.
   *
   * Dismissing is scoped to the message on screen, not to the screen — the next
   * read to fail is news again. `run` does not dismiss at all, which is what
   * lets a board that re-reads after every action still surface a failed
   * refresh.
   */
  clear: () => void;
};

/**
 * Folds a resource's read error together with the user's own action into the
 * one error line a screen shows.
 */
export function useScreenAction(
  resource: Pick<ApiResource<unknown>, "error">,
): ScreenAction {
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Whether the read error currently on screen has been waved away. Tracked as a
  // flag rather than copied into local state, so the message itself still lives
  // in exactly one place — the resource that produced it.
  const [dismissed, setDismissed] = useState(false);
  // ...and the message the flag is about, so a dismissal cannot outlive it. The
  // resource this reads from re-reads (on focus, after an action), and a read
  // that fails AFTER the user waved the last one away is news, not the thing
  // they dismissed. Reconciled during this very render — the sanctioned
  // adjust-state-on-render pattern, as in `useProgramEditor`.
  const [dismissedFrom, setDismissedFrom] = useState(resource.error);
  if (resource.error !== dismissedFrom) {
    setDismissedFrom(resource.error);
    setDismissed(false);
  }

  const clear = useCallback(() => {
    setActionError(null);
    setDismissed(true);
  }, []);

  const run = useCallback(
    async (work: () => Promise<void>, fallback: string) => {
      setBusy(true);
      setActionError(null);
      try {
        await work();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : fallback);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return {
    error: actionError ?? (dismissed ? null : resource.error),
    busy,
    run,
    refuse: setActionError,
    clear,
  };
}
