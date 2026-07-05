import { expect, test } from "vitest";
import { deriveBalance } from "../src/balance";

// ADR 0010: balance is derived from the ledger — count(purchases) minus
// sum(redemptions.beans_spent) — never read from a mutable counter.

test("a Customer with no Purchases has balance 0", () => {
  expect(deriveBalance({ purchases: 0, beansSpent: 0 })).toBe(0);
});

test("each Purchase is one Зернятко", () => {
  expect(deriveBalance({ purchases: 3, beansSpent: 0 })).toBe(3);
});

test("Redemptions subtract the beans they spent, not reset to zero", () => {
  // The ADR's worked example: balance 23, threshold 10 redeemed once → 13.
  expect(deriveBalance({ purchases: 23, beansSpent: 10 })).toBe(13);
});
