import { act, cleanup, renderHook, waitFor } from "./support/render-hook";
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
 * A refresh and a switch to a different resource are the same fetch and opposite
 * promises: one must not cost the reader what is already on screen, the other
 * must not leave it there. `load`'s identity is what tells them apart (#190).
 */
describe("useApiResource: a different resource", () => {
  /** Renders with a swappable loader — a café, or an analytics period. */
  function renderSwitchable(load: () => Promise<string>) {
    return renderHook(
      ({ load: current }: { load: () => Promise<string> }) =>
        useApiResource(current, FALLBACK),
      { initialProps: { load } },
    );
  }

  it("clears the previous resource's answer in the render that notices", () => {
    const { result, rerender } = renderSwitchable(() =>
      Promise.resolve("7 днів"),
    );
    // Not `waitFor`: the point is that nothing stale survives the switch even
    // for one frame, so the state is read the instant the new loader arrives.
    rerender({ load: () => deferred<string>().promise });

    expect(result.current).toMatchObject({
      data: null,
      error: null,
      loading: true,
    });
  });

  it("clears the previous resource's error too", async () => {
    const { result, rerender } = renderSwitchable(() =>
      Promise.reject(new Error("Немає мережі")),
    );
    await waitFor(() => expect(result.current.error).toBe("Немає мережі"));

    rerender({ load: () => deferred<string>().promise });

    expect(result.current.error).toBeNull();
  });

  it("cannot paint an earlier resource's answer over a later one", async () => {
    // The analytics toggle, tapped twice quickly (#190): both reads are in
    // flight and the FIRST one lands last. Whatever the screen shows must be the
    // period whose label it is showing.
    const sevenDays = deferred<string>();
    const thirtyDays = deferred<string>();
    const { result, rerender } = renderSwitchable(() => sevenDays.promise);

    rerender({ load: () => thirtyDays.promise });
    await act(async () => {
      thirtyDays.resolve("30 днів");
      sevenDays.resolve("7 днів");
      await sevenDays.promise;
      await thirtyDays.promise;
    });

    expect(result.current.data).toBe("30 днів");
  });

  it("ignores a reload held over from the resource before it", async () => {
    // Every action on the owner boards has the shape `await work(); await
    // reload()`, so a `reload` can outlive the resource it came from. Calling it
    // must be inert — if it cancelled the read that replaced it, nothing would
    // start another one and the screen would wait forever on a blank board.
    const { result, rerender } = renderSwitchable(() =>
      Promise.resolve("перша кав'ярня"),
    );
    await waitFor(() => expect(result.current.data).toBe("перша кав'ярня"));
    const staleReload = result.current.reload;

    const arriving = deferred<string>();
    rerender({ load: () => arriving.promise });
    await act(() => staleReload());
    await act(async () => {
      arriving.resolve("друга кав'ярня");
      await arriving.promise;
    });

    expect(result.current).toMatchObject({
      data: "друга кав'ярня",
      loading: false,
    });
  });

  it("warns that an unstable `load` is a refetch loop, not a switch", async () => {
    // The one way to hold this hook wrong: no `useCallback`, so every render
    // looks like a different resource. Nothing goes wrong until the first
    // response lands — that state update is what starts the loop — and then
    // React's own re-render limit stops it dead. Two things worth pinning:
    // our warning gets in first and names the actual fix, and the loop costs
    // exactly ONE request, not the unbounded stream of them it used to.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const load = vi.fn(() => Promise.resolve("ok"));
    renderHook(() => useApiResource(() => load(), FALLBACK));

    let stopped: unknown;
    try {
      await act(async () => {
        await new Promise((settle) => setTimeout(settle, 50));
      });
    } catch (e) {
      stopped = e;
    }

    expect(stopped).toBeInstanceOf(Error);
    expect((stopped as Error).message).toMatch(/Too many re-renders/);
    // Warned on the crossing, not on every change — React may replay the render
    // pass it abandoned, so what matters is that the console gets a line or two
    // naming the fix, never one per iteration.
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.length).toBeLessThan(5);
    for (const [message] of warn.mock.calls) {
      expect(message).toContain("useCallback");
    }
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when the resource changes at human speed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result, rerender } = renderSwitchable(() =>
      Promise.resolve("7 днів"),
    );

    // A CafeOwner flipping the period back and forth — far more times than
    // anyone would, but each read gets to land, which is what tells a real
    // switch apart from a render loop no matter how many there are.
    for (let i = 0; i < 20; i++) {
      rerender({ load: () => Promise.resolve(String(i)) });
      await waitFor(() => expect(result.current.data).toBe(String(i)));
    }

    expect(warn).not.toHaveBeenCalled();
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

    // Inside `act` because the reload writes state on its way to resolving; the
    // assertion is still that it RESOLVES rather than rejects.
    await act(async () => {
      await expect(result.current.reload()).resolves.toBeUndefined();
    });
  });
});
