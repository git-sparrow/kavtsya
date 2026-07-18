import { createDb } from "../src/db";
import { loadDatabaseUrl, loadDotEnv } from "../src/env";
import { findNegativeBalances } from "../src/purchases";

/**
 * Ledger invariant audit (#115, ADR 0010): every (Customer, Café) derived
 * balance must be ≥ 0 — no Redemption ever overdrew. The check is enforced at
 * write time under a `FOR UPDATE` lock; this audits it after the fact, the same
 * cron-friendly rig as the Ворожка batch. Runnable against a live database
 * before and during pilots. Needs DATABASE_URL. Exits non-zero when any balance
 * is negative so a scheduled run or CI gate fails loudly.
 */

loadDotEnv();

const db = createDb(loadDatabaseUrl());

try {
  const violations = await findNegativeBalances(db);
  if (violations.length === 0) {
    console.log("Ledger invariant holds: no negative derived balances");
  } else {
    console.error(
      `Ledger invariant VIOLATED — ${violations.length} negative balance(s):`,
    );
    for (const v of violations) {
      console.error(
        `  cafe ${v.cafeId} · customer ${v.customerId} · balance ${v.balance}`,
      );
    }
    process.exitCode = 1;
  }
} finally {
  await db.end();
}
