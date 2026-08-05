import { createDb } from "../src/db";
import { runMigrations } from "../src/migrate";
import { resetPlatformConfig } from "./helpers/platform-config";
import { TEST_DATABASE_URL } from "./helpers/testDb";

/**
 * Cross-run isolation for `platform_config`, owned by the harness (#114).
 *
 * The test database is persistent and `platform_config` is deliberately not
 * truncated per suite, so before this existed a config mutation that escaped a
 * test survived into the NEXT `vitest run` and surfaced as an unrelated suite
 * failing, a run later, with nothing pointing back at the leak. Resetting the
 * table to its shipped defaults here — before any suite connects — makes every
 * run start from the same known state no matter how the last one ended
 * (leaked, crashed, or interrupted mid-test).
 *
 * The reset is the invariant; `withPlatformConfig` stays a scoping convenience.
 *
 * Sibling of #54, which gave each app its own in-memory config cache: that
 * isolates suites from each other within a run, this isolates runs.
 */

export async function setup(): Promise<void> {
  const db = createDb(TEST_DATABASE_URL);
  try {
    // Suites migrate too, but the reset needs the table to exist first — on a
    // freshly created database this is what creates it. Idempotent.
    await runMigrations(db);
    await resetPlatformConfig(db);
  } finally {
    await db.end();
  }
}
