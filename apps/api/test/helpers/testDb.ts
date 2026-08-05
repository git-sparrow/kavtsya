import { Pool } from "pg";
import { createAuth, type Auth } from "../../src/auth";
import { createDb, type Database } from "../../src/db";
import { loadDotEnv } from "../../src/env";
import { runMigrations } from "../../src/migrate";

loadDotEnv();

/** The one test database every suite and the global setup files connect to. */
export const TEST_DATABASE_URL =
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

/**
 * Build a Better Auth instance bound to the test Postgres (via its own pg Pool,
 * since Better Auth has no postgres.js adapter). Caller owns the pool and must
 * `end()` it. A fixed test secret keeps sessions stable without touching env.
 */
export function setupTestAuth(): { auth: Auth; pool: Pool } {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  const auth = createAuth({
    database: pool,
    secret: "test-secret-at-least-32-characters-long",
    baseURL: "http://localhost:3000",
  });
  return { auth, pool };
}
