import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * One API read, as a screen sees it (#53). Every data-loading hook in the app is
 * built on this, so "loading", "failed", and "cancelled after I left" mean the
 * same thing everywhere instead of being re-derived per hook.
 */
export type ApiResource<T> = {
  /** The last successful body, or null before the first one arrives. */
  data: T | null;
  /** A message ready to show, or null. Set on failure, cleared by the next success. */
  error: string | null;
  /**
   * True until the FIRST answer settles, either way — "we don't know yet", not
   * "a request is in flight". A refresh over data already on screen is not
   * loading: the screen has something true to show while it happens.
   */
  loading: boolean;
  /**
   * Read it again. Never rejects — a failure lands in `error`, so callers can
   * fire it and forget. A response is dropped if it is superseded before it
   * lands: by a later `reload`, by a switch to a different resource, or by the
   * screen unmounting. (Blur is not one of them — a blurred screen is still
   * mounted, and the value it holds is still the one it will show on return.)
   */
  reload: () => Promise<void>;
};

type State<T> = Pick<ApiResource<T>, "data" | "error" | "loading"> & {
  /**
   * The loader this state is an answer to. Carried in the state rather than
   * alongside it so that "is this still what the screen is asking?" is settled
   * by the same value being updated — a stale response cannot slip through the
   * gap between noticing the switch and starting the new read.
   */
  answers: () => Promise<T>;
  /**
   * How many resource changes in a row have abandoned a read before it finished
   * — the runaway-`load` detector's tally (see `warnOnRunawayReloads`).
   */
  churn: number;
};

/**
 * Where every resource starts, and where it returns whenever the question
 * changes: nothing known, nothing wrong, still waiting.
 */
function nothingKnownYet<T>(answers: () => Promise<T>, churn = 0): State<T> {
  return { data: null, error: null, loading: true, answers, churn };
}

/**
 * Loads an API resource once on mount and hands back its state (#53).
 *
 * `load` must be stable — wrap it in `useCallback` keyed by whatever identifies
 * the resource (a `cafeId`, a period). Its identity IS the identity of the
 * resource, and the hook treats the two possible reasons to read differently:
 *
 * - **A refresh** (`reload`, or regaining focus) KEEPS what is already on
 *   screen. It is the same resource; a slow or failed refresh should cost the
 *   reader the update, not the data they were already looking at.
 * - **A different resource** (`load`'s identity changed) RESETS to `data: null`,
 *   `error: null`, `loading: true`, in the same render that notices. The old
 *   answer is not an answer to the new question, so showing it — even for one
 *   frame — would paint one Café's numbers under another's name.
 *
 * Forgetting `useCallback` therefore reads as "a brand new resource on every
 * render", and that now fails loudly rather than quietly. The first response
 * starts a reset-and-re-render loop, which React ends by throwing at its own
 * re-render limit — after a single request, with `warnOnRunawayReloads` getting
 * a line in first that names the fix.
 *
 * Be clear about the trade: that throw is NOT development-only. Only the warning
 * is. A screen shipped with an unstable `load` crashes on the user's phone
 * instead of quietly refetching forever — accepted because the failure is
 * deterministic on the first render of the screen, so it cannot reach anyone's
 * phone without first breaking in front of whoever wrote it, whereas the silent
 * version could ship undetected and bill a stranger's mobile data.
 *
 * `fallback` is the message shown when the failure carries none of its own.
 */
export function useApiResource<T>(
  load: () => Promise<T>,
  fallback: string,
): ApiResource<T> {
  const resource = useResource(load, fallback);
  const { reload } = resource;

  useEffect(() => {
    void reload();
  }, [reload]);

  return resource;
}

/**
 * The same resource, re-read every time the screen regains focus — for values
 * that change on someone else's device (a balance the CafeOwner just moved), so
 * coming back to the screen is the natural refresh point.
 *
 * A separate entry point rather than a flag on `useApiResource`, because
 * `useFocusEffect` needs a navigator above it: hooks that run outside one (the
 * app-wide `MeProvider` sits above the `Stack`) cannot call it at all.
 */
export function useFocusedApiResource<T>(
  load: () => Promise<T>,
  fallback: string,
): ApiResource<T> {
  const resource = useResource(load, fallback);
  const { reload } = resource;

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return resource;
}

/**
 * How many resource changes in a row may abandon a read that never finished.
 *
 * A real switch settles: the user picks a period, the answer arrives, `loading`
 * goes false. Someone flipping a toggle faster than the network can be expected
 * to stack two or three unfinished reads — never ten. Ten means the reads are
 * not being outrun, they are never being started, which is the one shape a
 * `load` rebuilt on every render produces. Counting that rather than elapsed
 * time keeps the check pure, and makes it independent of how fast the API is.
 *
 * Deliberately well under React's own re-render limit, which is what ends the
 * loop: the two share one budget with any other render-phase update in the same
 * component (`useProgramEditor` sets two), and the warning naming the fix is
 * worth much more than the message that follows it.
 */
const CHURN_LIMIT = 10;

/**
 * The one way to hold this hook wrong, made loud in development (#190).
 *
 * An unstable `load` means every render looks like a different resource, so the
 * hook resets, re-renders, and looks again — forever. React's own re-render
 * limit is what actually stops it, and its message ("Too many re-renders")
 * names neither this hook nor the fix. This gets in first and does.
 *
 * Fires on the crossing rather than on every change, so a loop leaves a line or
 * two to read rather than burying the console. Silent in production, where a
 * `console.warn` helps nobody.
 */
function warnOnRunawayReloads(churn: number): void {
  if (!__DEV__ || churn !== CHURN_LIMIT) return;

  console.warn(
    `useApiResource: the resource changed ${CHURN_LIMIT} times in a row without ` +
      "one read finishing, which is a refetch loop rather than a real switch. " +
      "Its `load` is almost certainly a fresh function every render — wrap it in " +
      "`useCallback` keyed by whatever identifies the resource.",
  );
}

/**
 * The shared core: the state, the fetch, and the two ways a response can be
 * obsolete by the time it lands. Neither entry point loads anything itself —
 * they only differ in what triggers `reload`.
 */
function useResource<T>(
  load: () => Promise<T>,
  fallback: string,
): ApiResource<T> {
  const [state, setState] = useState<State<T>>(() => nothingKnownYet(load));

  // Which read of THIS resource the screen is waiting for. Two ways a response
  // can be obsolete run through it — a later reload started, or the screen went
  // away — and the third, a switch to a different resource, is `state.answers`
  // below. Bump this, and anything older stays quiet.
  const generation = useRef(0);

  // A change of `load` means a different question is being asked, so the
  // previous answer is cleared during this very render — the sanctioned
  // adjust-state-on-render pattern, as in `useProgramEditor` — rather than in an
  // effect, which would let the stale value paint one frame under the new label.
  if (state.answers !== load) {
    // A switch away from a resource that had already answered starts the tally
    // over; one that abandons a read still in flight continues it.
    const churn = state.loading ? state.churn + 1 : 1;
    warnOnRunawayReloads(churn);
    setState(nothingKnownYet(load, churn));
  }

  // The resource the screen is on, readable from a callback that may have been
  // created for a different one. Declared here rather than in either entry point
  // so it is committed BEFORE the effect that fires the new read — this hook's
  // effects run first, and the ordering is what makes the guard in `reload` mean
  // what it says.
  const current = useRef(load);
  useEffect(() => {
    current.current = load;
  }, [load]);

  // Leaving invalidates whatever is still in flight. On a plain unmount React
  // would discard the write anyway, but state does NOT always die with the
  // effects: a subtree React only hides (`<Activity>`) is cleaned up and later
  // restored with its state intact, and a response landing in between would
  // surface as fact on a screen that never asked for it.
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );

  const reload = useCallback(async () => {
    // A `reload` handed out before a switch and called after it — the shape any
    // `await work(); await reload()` action has — belongs to a resource the
    // screen has left. It must not read, and above all must not bump the
    // generation: that would cancel the read that REPLACED it and leave the
    // screen loading forever, since nothing would start another one.
    if (current.current !== load) return;

    const mine = ++generation.current;
    const stillWanted = () => generation.current === mine;
    // The second half of the same question, asked at the moment of writing: is
    // the state still an answer to MY resource? It closes the window between the
    // render that notices a switch and the effect that starts the new read, in
    // which this response would otherwise still look current.
    const ifStillMine = (next: (prev: State<T>) => State<T>) =>
      setState((prev) => (prev.answers === load ? next(prev) : prev));

    try {
      const data = await load();
      if (stillWanted()) {
        ifStillMine((prev) => ({ ...prev, data, error: null, loading: false }));
      }
    } catch (e) {
      // Keep whatever is already on screen: a failed refresh should cost the
      // reader the update, not the data they were already looking at.
      if (stillWanted()) {
        const error = e instanceof Error ? e.message : fallback;
        ifStillMine((prev) => ({ ...prev, error, loading: false }));
      }
    }
  }, [load, fallback]);

  const { data, error, loading } = state;
  return { data, error, loading, reload };
}
