import { expect, test } from "vitest";
import { applyRedemption, redemptionEligibility } from "../src/redemptions";

// The two pure Redemption rules (#22, CONTEXT → Redemption), unit-tested at
// their own seam; the full confirm path is covered in redemptions.test.ts.

// --- eligibility ------------------------------------------------------------------

test("a balance below the threshold is not eligible", () => {
  expect(
    redemptionEligibility({
      balance: 9,
      threshold: 10,
      reward: { type: "free_drink" },
    }),
  ).toEqual({ eligible: false, reason: "insufficient_balance" });
});

test("a balance meeting the threshold exactly is eligible", () => {
  expect(
    redemptionEligibility({
      balance: 10,
      threshold: 10,
      reward: { type: "free_drink" },
    }),
  ).toEqual({ eligible: true, reward: { type: "free_drink" } });
});

test("without a configured Reward there is nothing to claim, whatever the balance", () => {
  expect(
    redemptionEligibility({ balance: 100, threshold: 10, reward: null }),
  ).toEqual({ eligible: false, reason: "no_reward" });
});

// --- subtract-threshold -----------------------------------------------------------

test("a Redemption spends exactly the threshold and preserves the leftover", () => {
  // The ADR 0010 worked example: balance 23, threshold 10 → 13, never reset to 0.
  expect(applyRedemption({ balance: 23, threshold: 10 })).toEqual({
    beansSpent: 10,
    balance: 13,
  });
});

test("a banked balance still leaves the next Redemption available", () => {
  // 2× threshold: after the first confirm the second is still fully covered.
  expect(applyRedemption({ balance: 20, threshold: 10 })).toEqual({
    beansSpent: 10,
    balance: 10,
  });
});
