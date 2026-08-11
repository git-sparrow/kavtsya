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

type State<T> = Pick<ApiResource<T>, "data" | "error" | "loading">;

/**
 * Loads an API resource once on mount and hands back its state (#53).
 *
 * `load` must be stable — wrap it in `useCallback` keyed by whatever identifies
 * the resource (a `cafeId`, say). Its identity IS the identity of the resource:
 * when it changes, the hook reads the new one and drops any response still in
 * flight for the old one.
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
 * The shared core: the state, the fetch, and the two ways a response can be
 * obsolete by the time it lands. Neither entry point loads anything itself —
 * they only differ in what triggers `reload`.
 */
function useResource<T>(
  load: () => Promise<T>,
  fallback: string,
): ApiResource<T> {
  const [state, setState] = useState<State<T>>({
    data: null,
    error: null,
    loading: true,
  });

  // Which read the screen is actually waiting for. Every way a response can be
  // obsolete by the time it lands is the same fact — a later reload started, the
  // loader changed to a different resource, or the screen went away — so all
  // three are one mechanism: bump this, and anything older stays quiet.
  const generation = useRef(0);

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
    const mine = ++generation.current;
    const stillWanted = () => generation.current === mine;

    try {
      const data = await load();
      if (stillWanted()) setState({ data, error: null, loading: false });
    } catch (e) {
      // Keep whatever is already on screen: a failed refresh should cost the
      // reader the update, not the data they were already looking at.
      if (stillWanted()) {
        const error = e instanceof Error ? e.message : fallback;
        setState((prev) => ({ ...prev, error, loading: false }));
      }
    }
  }, [load, fallback]);

  return { ...state, reload };
}
