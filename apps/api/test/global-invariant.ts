import { createDb } from "../src/db";
import { findNegativeBalances } from "../src/purchases";
import { TEST_DATABASE_URL } from "./helpers/testDb";

/**
 * The ledger invariant as a true cross-suite check (#115, ADR 0010): it runs in
 * `teardown`, once, AFTER every suite has finished exercising the shared test
 * database — the "after the write-path suites have exercised the ledger" the
 * issue asks for. No suite may leave a (Customer, Café) derived balance below
 * zero; if one does, the whole run fails here, naming the offenders.
 *
 * This is the safety net over accumulated state; `ledger-invariant.test.ts` is
 * the deterministic proof that the detector fires (its negative control cleans
 * up its forged row so it can't trip this end-of-run assertion).
 */

export function setup(): void {}

export async function teardown(): Promise<void> {
  const db = createDb(TEST_DATABASE_URL);
  try {
    const violations = await findNegativeBalances(db);
    if (violations.length > 0) {
      const detail = violations
        .map(
          (v) => `cafe ${v.cafeId} · customer ${v.customerId} · ${v.balance}`,
        )
        .join("; ");
      throw new Error(
        `Ledger invariant violated after the run — ${violations.length} negative balance(s): ${detail}`,
      );
    }
  } finally {
    await db.end();
  }
}
