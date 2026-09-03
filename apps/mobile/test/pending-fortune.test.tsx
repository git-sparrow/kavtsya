import type { PendingFortune } from "@kavtsya/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { act, cleanup, renderHook } from "./support/render-hook";

/**
 * The Ворожка reveal's dismissal (#23, turn 1).
 *
 * «Дякую» closes the card at once and lets the seen-write travel afterwards, so
 * there is a window in which the server still reports the fortune as unrevealed.
 * The poll restarts inside that window — measured winning the race by ~29ms on a
 * simulator — so these pin that the reveal the Customer just closed cannot come
 * back, while a genuinely new one still gets through.
 */

const fetchPendingFortune = vi.fn<() => Promise<PendingFortune | null>>();
const markFortuneSeen = vi.fn<(id: string) => Promise<void>>();
vi.mock("@/lib/api", () => ({ fetchPendingFortune, markFortuneSeen }));

const { usePendingFortune } =
  await import("../src/features/loyalty/use-pending-fortune");

/** One poll interval, as the hook defines it. */
const POLL_TICK = 4000;

function fortune(id: string): PendingFortune {
  return {
    id,
    fortune: `фортуна ${id}`,
    cafeId: "cafe-1",
    cafeName: "Кавярня «Демо»",
    balance: 2,
    threshold: 5,
    reward: { type: "free_drink" },
  };
}

/** Render and let the first poll settle. */
async function open() {
  const rendered = renderHook(() => usePendingFortune());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return rendered;
}

/** Let `ms` of polling elapse, flushing each fetch that lands. */
async function elapse(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchPendingFortune.mockReset();
  markFortuneSeen.mockReset();
  markFortuneSeen.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("usePendingFortune", () => {
  it("does not reveal the same fortune again when the seen-write is still in flight", async () => {
    // The server has not recorded the dismissal yet, so it keeps handing the
    // same fortune back — exactly the state the race leaves it in.
    fetchPendingFortune.mockResolvedValue(fortune("f1"));
    markFortuneSeen.mockReturnValue(new Promise(() => {})); // never settles

    const { result } = await open();
    expect(result.current.fortune?.id).toBe("f1");

    await act(async () => {
      result.current.dismiss();
    });
    expect(result.current.fortune).toBeNull();

    await elapse(20_000);

    expect(result.current.fortune).toBeNull();
  });

  it("still reveals a genuinely new fortune after one is dismissed", async () => {
    fetchPendingFortune.mockResolvedValue(fortune("f1"));

    const { result } = await open();
    await act(async () => {
      result.current.dismiss();
    });

    // The next scan lands.
    fetchPendingFortune.mockResolvedValue(fortune("f2"));
    await elapse(POLL_TICK);

    expect(result.current.fortune?.id).toBe("f2");
  });

  it("does not loop when the seen-write fails outright", async () => {
    fetchPendingFortune.mockResolvedValue(fortune("f1"));
    markFortuneSeen.mockRejectedValue(new Error("offline"));

    const { result } = await open();
    await act(async () => {
      result.current.dismiss();
    });

    await elapse(20_000);

    // The server never learned; the Customer is still not nagged.
    expect(result.current.fortune).toBeNull();
  });

  it("marks the dismissed fortune seen exactly once", async () => {
    fetchPendingFortune.mockResolvedValue(fortune("f1"));

    const { result } = await open();
    await act(async () => {
      result.current.dismiss();
    });

    await elapse(20_000);

    expect(markFortuneSeen).toHaveBeenCalledTimes(1);
    expect(markFortuneSeen).toHaveBeenCalledWith("f1");
  });
});
