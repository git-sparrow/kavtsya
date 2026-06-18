import { createDb, type Database } from "../../src/db";
import { loadDotEnv } from "../../src/env";
import { runMigrations } from "../../src/migrate";

loadDotEnv();

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://kavtsya:kavtsya@localhost:5432/kavtsya_test";

/**
 * Connect to the REAL test Postgres and ensure the schema is migrated.
 * No mocking — integration tests run against an actual database, the primary
 * test seam from the PRD. Caller owns the connection and must `end()` it.
 */
export async function setupTestDb(): Promise<Database> {
  const db = createDb(TEST_DATABASE_URL);
  await runMigrations(db);
  return db;
}
