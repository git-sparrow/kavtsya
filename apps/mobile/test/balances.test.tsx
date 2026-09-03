import type { CafeBalance, CafeBalancesResponse } from "@kavtsya/shared";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { act, cleanup, renderHook } from "./support/render-hook";

/**
 * The balances read (#20) and the counter-staleness it has to survive.
 *
 * A Redemption is confirmed on the CafeOwner's device while the Customer stands
 * at the counter looking at their own screen — which therefore never blurs, so
 * the on-focus refetch cannot catch it. These pin the poll that covers that
 * window, and just as importantly pin that it does NOT run the rest of the time.
 *
 * `useFocusEffect` stands in as a plain effect: what focus itself does is React
 * Navigation's guarantee, not ours (cf. use-api-resource.test.tsx).
 */
vi.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    useEffect(callback, [callback]);
  },
}));

const fetchBalances = vi.fn<() => Promise<CafeBalancesResponse>>();
vi.mock("@/lib/api", () => ({ fetchBalances }));

const { useBalances } = await import("../src/features/loyalty/use-balances");

/** A Café whose Reward is ready to claim — the one state a confirm can land in. */
const CLAIMABLE: CafeBalance = {
  cafeId: "cafe-1",
  cafeName: "Кавярня «Демо»",
  balance: 5,
  threshold: 5,
  reward: { type: "free_drink" },
  archived: false,
};

/** The same Café mid-collection: nothing to confirm, so nothing to watch for. */
const COLLECTING: CafeBalance = { ...CLAIMABLE, balance: 2 };

/** What the ledger reads once the CafeOwner's confirm has spent the threshold. */
const CLAIMED: CafeBalance = { ...CLAIMABLE, balance: 0 };

/** Render the hook and let its first read settle. */
async function open() {
  const rendered = renderHook(() => useBalances());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return rendered;
}

/** Let `ms` of polling elapse, flushing each read that lands. */
async function elapse(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchBalances.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useBalances", () => {
  it("picks up a Redemption confirmed on the CafeOwner's device, with no navigation", async () => {
    fetchBalances
      .mockResolvedValueOnce([CLAIMABLE])
      .mockResolvedValue([CLAIMED]);

    const { result } = await open();
    expect(result.current.balances).toEqual([CLAIMABLE]);

    await elapse(2500);

    // The Customer never left the screen; the card is correct anyway.
    expect(result.current.balances).toEqual([CLAIMED]);
  });

  it("does not poll while the Customer is only collecting", async () => {
    fetchBalances.mockResolvedValue([COLLECTING]);

    await open();
    expect(fetchBalances).toHaveBeenCalledTimes(1);

    await elapse(10_000);

    // Nothing can be confirmed against this Café, so nothing is worth asking.
    expect(fetchBalances).toHaveBeenCalledTimes(1);
  });

  it("stops polling once the Reward has been claimed", async () => {
    fetchBalances
      .mockResolvedValueOnce([CLAIMABLE])
      .mockResolvedValue([CLAIMED]);

    await open();
    await elapse(2500);
    const settled = fetchBalances.mock.calls.length;

    await elapse(10_000);

    expect(fetchBalances).toHaveBeenCalledTimes(settled);
  });

  it("does not poll for an archived Café, whose balance is frozen", async () => {
    fetchBalances.mockResolvedValue([{ ...CLAIMABLE, archived: true }]);

    await open();
    expect(fetchBalances).toHaveBeenCalledTimes(1);

    await elapse(10_000);

    expect(fetchBalances).toHaveBeenCalledTimes(1);
  });
});
