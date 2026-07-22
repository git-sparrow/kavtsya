import { expect, test } from "vitest";

import { isRedemptionReady } from "@kavtsya/shared";

/**
 * The shared redemption-readiness rule (#113): the one predicate the API's
 * eligibility check and both mobile display sites now share, so the «готово»
 * state can't drift between them. Ready = a Reward is configured AND the balance
 * meets the threshold — both clauses are load-bearing.
 */

const freeDrink = { type: "free_drink" } as const;

test("ready when a Reward is configured and the balance meets the threshold", () => {
  expect(
    isRedemptionReady({ balance: 10, threshold: 10, reward: freeDrink }),
  ).toBe(true);
});

test("a banked balance beyond the threshold is still ready", () => {
  expect(
    isRedemptionReady({ balance: 23, threshold: 10, reward: freeDrink }),
  ).toBe(true);
});

test("not ready below the threshold, even with a Reward configured", () => {
  expect(
    isRedemptionReady({ balance: 9, threshold: 10, reward: freeDrink }),
  ).toBe(false);
});

test("not ready without a configured Reward, even at or above the threshold", () => {
  // The clause the balances list used to omit (#113): threshold met but no
  // Reward to claim must not show «готово».
  expect(isRedemptionReady({ balance: 10, threshold: 10, reward: null })).toBe(
    false,
  );
  expect(isRedemptionReady({ balance: 50, threshold: 10, reward: null })).toBe(
    false,
  );
});
