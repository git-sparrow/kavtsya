import { act, cleanup, renderHook } from "./support/render-hook";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TRANSIENT_NOTICE_MS,
  useNoticeLifetime,
} from "@/lib/use-notice-lifetime";

/**
 * The two lifetimes a floating notice can have (#219). The shell animates; this
 * is the part that decides *when* it leaves — and that it leaves once. A
 * transient notice that both times out and gets its ✕ tapped must not run its
 * exit twice, and a persistent one (a failed check) must never wave itself away
 * while the barista is still between orders.
 */

/** An exit that finishes only when the test says so, like a running animation. */
function pendingExit() {
  const finishes: (() => void)[] = [];
  const exit = vi.fn((done: () => void) => {
    finishes.push(done);
  });
  return { exit, finish: () => finishes.forEach((f) => f()) };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useNoticeLifetime", () => {
  it("lets a transient notice leave on its own, after the exit finishes", () => {
    const onDismiss = vi.fn();
    const { exit, finish } = pendingExit();
    renderHook(() =>
      useNoticeLifetime({ lifetime: "transient", onDismiss, exit }),
    );

    act(() => vi.advanceTimersByTime(TRANSIENT_NOTICE_MS - 1));
    expect(exit).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(exit).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();

    finish();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("never times out a persistent notice", () => {
    const onDismiss = vi.fn();
    const { exit } = pendingExit();
    renderHook(() =>
      useNoticeLifetime({ lifetime: "persistent", onDismiss, exit }),
    );

    act(() => vi.advanceTimersByTime(TRANSIENT_NOTICE_MS * 12));

    expect(exit).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("runs the exit once when the ✕ and the timeout both fire", () => {
    const onDismiss = vi.fn();
    const { exit, finish } = pendingExit();
    const { result } = renderHook(() =>
      useNoticeLifetime({ lifetime: "transient", onDismiss, exit }),
    );

    act(() => result.current());
    act(() => result.current());
    act(() => vi.advanceTimersByTime(TRANSIENT_NOTICE_MS));
    finish();

    expect(exit).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("lets a persistent notice be dismissed by hand", () => {
    const onDismiss = vi.fn();
    const { exit, finish } = pendingExit();
    const { result } = renderHook(() =>
      useNoticeLifetime({ lifetime: "persistent", onDismiss, exit }),
    );

    act(() => result.current());
    finish();

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not restart the countdown when the caller re-renders", () => {
    // A caller passing an inline `onDismiss` hands over a new function every
    // render; that must not buy the notice a fresh countdown on screen.
    const { exit } = pendingExit();
    const { rerender } = renderHook<
      ReturnType<typeof useNoticeLifetime>,
      { onDismiss: () => void }
    >(
      ({ onDismiss }) =>
        useNoticeLifetime({ lifetime: "transient", onDismiss, exit }),
      { initialProps: { onDismiss: () => {} } },
    );

    act(() => vi.advanceTimersByTime(TRANSIENT_NOTICE_MS - 1));
    rerender({ onDismiss: () => {} });
    act(() => vi.advanceTimersByTime(1));

    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("calls the latest onDismiss, not the one it mounted with", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { exit, finish } = pendingExit();
    const { rerender } = renderHook<
      ReturnType<typeof useNoticeLifetime>,
      { onDismiss: () => void }
    >(
      ({ onDismiss }) =>
        useNoticeLifetime({ lifetime: "transient", onDismiss, exit }),
      { initialProps: { onDismiss: first } },
    );

    rerender({ onDismiss: latest });
    act(() => vi.advanceTimersByTime(TRANSIENT_NOTICE_MS));
    finish();

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it("stops the countdown when the notice unmounts first", () => {
    const { exit } = pendingExit();
    const { unmount } = renderHook(() =>
      useNoticeLifetime({ lifetime: "transient", onDismiss: () => {}, exit }),
    );

    unmount();
    act(() => vi.advanceTimersByTime(TRANSIENT_NOTICE_MS));

    expect(exit).not.toHaveBeenCalled();
  });
});
