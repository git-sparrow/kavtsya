// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useCallback, useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The one hook every data-loading hook is built on (#53). What it owes its
 * callers: an answer or a message, never a half-state; and nothing written back
 * to a screen that has gone away or moved on to a different resource.
 *
 * This runs in jsdom against react-dom — `useApiResource` is plain React with no
 * React Native in it, which is exactly why it can be tested at all. Anything
 * that renders RN components still goes through Argent on a simulator.
 *
 * `expo-router` is stubbed because importing it drags in the untransformed
 * React Native source tree. `useFocusEffect` stands in as "the screen is focused
 * for as long as it is mounted", which is the case the focused variant exists
 * for; what focus itself does is React Navigation's to guarantee, not ours.
 */
vi.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    useEffect(callback, [callback]);
  },
}));

const { useApiResource, useFocusedApiResource } =
  await import("../src/lib/use-api-resource");

/** A promise whose settlement this test controls, so timing is never a race. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const FALLBACK = "Не вдалося завантажити";

/** Renders the hook with a loader whose identity is stable across renders. */
function render<T>(load: () => Promise<T>) {
  return renderHook(() => useApiResource(useCallback(load, []), FALLBACK));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useApiResource: loading", () => {
  it("starts loading with no data and no error", () => {
    const { result } = render(() => deferred<string>().promise);

    expect(result.current).toMatchObject({
      data: null,
      error: null,
      loading: true,
    });
  });

  it("stops loading once the first answer arrives", async () => {
    const { result } = render(() => Promise.resolve("зернятка"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe("зернятка");
    expect(result.current.error).toBeNull();
  });

  it("stops loading once the first failure arrives", async () => {
    const { result } = render(() => Promise.reject(new Error("Немає мережі")));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Немає мережі");
  });

  it("loads exactly once on mount", async () => {
    const load = vi.fn(() => Promise.resolve("ok"));
    const { result } = render(load);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("useApiResource: errors", () => {
  it("surfaces the thrown Error's message — the API client's screen copy", async () => {
    const { result } = render(() =>
      Promise.reject(new Error("Не вдалося завантажити профіль")),
    );

    await waitFor(() =>
      expect(result.current.error).toBe("Не вдалося завантажити профіль"),
    );
  });

  it("falls back when something that is not an Error is thrown", async () => {
    const { result } = render(() => Promise.reject("a bare string"));

    await waitFor(() => expect(result.current.error).toBe(FALLBACK));
  });

  it("keeps the data it already had when a refresh fails", async () => {
    // A Customer who has their balances on screen must not lose them because a
    // background refresh hit a dead spot — they see the numbers and the error.
    let attempt = 0;
    const load = () =>
      attempt++ === 0
        ? Promise.resolve("зернятка")
        : Promise.reject(new Error("Немає мережі"));
    const { result } = render(load);

    await waitFor(() => expect(result.current.data).toBe("зернятка"));
    await act(() => result.current.reload());

    expect(result.current.data).toBe("зернятка");
    expect(result.current.error).toBe("Немає мережі");
  });

  it("clears a stale error once a retry succeeds", async () => {
    let attempt = 0;
    const load = () =>
      attempt++ === 0
        ? Promise.reject(new Error("Немає мережі"))
        : Promise.resolve("зернятка");
    const { result } = render(load);

    await waitFor(() => expect(result.current.error).toBe("Немає мережі"));
    await act(() => result.current.reload());

    expect(result.current.error).toBeNull();
    expect(result.current.data).toBe("зернятка");
  });
});

describe("useApiResource: reload", () => {
  it("refetches and replaces the data", async () => {
    let next = "one";
    const { result } = render(() => Promise.resolve(next));

    await waitFor(() => expect(result.current.data).toBe("one"));
    next = "two";
    await act(() => result.current.reload());

    expect(result.current.data).toBe("two");
  });

  it("keeps a stable identity so callers can depend on it", async () => {
    const { result } = render(() => Promise.resolve("ok"));
    const first = result.current.reload;

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.reload).toBe(first);
  });
});

describe("useFocusedApiResource", () => {
  it("loads the resource while the screen is focused", async () => {
    const load = vi.fn(() => Promise.resolve("зернятка"));
    const { result } = renderHook(() =>
      useFocusedApiResource(useCallback(load, []), FALLBACK),
    );

    await waitFor(() => expect(result.current.data).toBe("зернятка"));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("shares the mount variant's contract", async () => {
    const { result } = renderHook(() =>
      useFocusedApiResource(
        useCallback(() => Promise.reject(new Error("Немає мережі")), []),
        FALLBACK,
      ),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ data: null, error: "Немає мережі" });
  });
});

/**
 * All three ways a response can be obsolete when it lands run through one
 * generation counter, so these tests exercise a single mechanism from three
 * angles. Note React 19 silently discards a state update aimed at an unmounted
 * component and logs nothing, so "did not write after unmount" is not directly
 * observable from outside — the two rerender cases below are what actually pin
 * the guard down, and the unmount case asserts what it honestly can.
 */
describe("useApiResource: cancellation", () => {
  it("drops a response for a resource the screen has moved on from", async () => {
    // The real-world shape: a screen switches café while the first café's
    // program is still in flight. The abandoned response must never land on the
    // café now on screen.
    const stale = deferred<string>();
    const { result, rerender } = renderHook(
      ({ load }: { load: () => Promise<string> }) =>
        useApiResource(load, FALLBACK),
      { initialProps: { load: () => stale.promise } },
    );

    rerender({ load: () => Promise.resolve("the café now on screen") });
    await waitFor(() =>
      expect(result.current.data).toBe("the café now on screen"),
    );

    await act(async () => {
      stale.resolve("the café we left");
      await stale.promise;
    });

    expect(result.current.data).toBe("the café now on screen");
  });

  it("lets the newest response win when an older one is still in flight", async () => {
    // Two reads race — a double-tapped retry, or a focus during a refresh. The
    // one started last is what the screen asked for most recently, so a slow
    // earlier response must not overwrite it.
    const first = deferred<string>();
    const second = deferred<string>();
    const loads = [first.promise, second.promise];
    let call = 0;
    const { result } = render(() => loads[call++]);

    await act(async () => {
      void result.current.reload();
      second.resolve("newest");
      first.resolve("stale");
      await first.promise;
      await second.promise;
    });

    expect(result.current.data).toBe("newest");
  });

  it("survives a response landing after the screen unmounts", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const inFlight = deferred<string>();
    const { unmount } = render(() => inFlight.promise);

    unmount();
    inFlight.resolve("arrives too late");
    await inFlight.promise;

    expect(consoleError).not.toHaveBeenCalled();
  });

  it("never rejects, so a failed read cannot leak from a fire-and-forget call", async () => {
    // Callers trigger reads with `void reload()` — from an effect, a focus, or a
    // retry button. If `reload` rejected, every one of those would be an
    // unhandled rejection, so absorbing the failure into `error` is the contract.
    const { result } = render(() => Promise.reject(new Error("Немає мережі")));

    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.reload()).resolves.toBeUndefined();
  });
});
