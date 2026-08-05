import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import type { Database } from "../src/db";
import { MIGRATIONS_DIR } from "../src/migrate";
import {
  PLATFORM_CONFIG_DEFAULTS,
  resetPlatformConfig,
} from "./helpers/platform-config";
import { setupTestDb } from "./helpers/testDb";

/**
 * The cross-run isolation the harness owns (#114). The test database persists
 * between `vitest run`s, so a config mutation that escapes a test used to
 * survive into the NEXT run and break an unrelated suite. Global setup now
 * resets `platform_config` to the shipped defaults before every run; these
 * tests are the deterministic proof that the reset actually restores them, and
 * that "the shipped defaults" still means what the migrations seed.
 */

let db: Database;

beforeAll(async () => {
  db = await setupTestDb();
});

afterAll(async () => {
  // Leave the table exactly as the run expects to find it.
  await resetPlatformConfig(db);
  await db?.end();
});

/** The whole `platform_config` table as a plain key → value record. */
async function readConfig(db: Database): Promise<Record<string, unknown>> {
  const rows = await db<{ key: string; value: unknown }[]>`
    select "key", "value" from platform_config
  `;
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Every migration in filename order, comment lines stripped. */
async function migrationStatements(): Promise<{ file: string; sql: string }[]> {
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  return Promise.all(
    files.map(async (file) => ({
      file,
      sql: (await readFile(join(MIGRATIONS_DIR, file), "utf8"))
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n"),
    })),
  );
}

/** The one seeding shape the migrations use, and this replay understands. */
const SEED_INSERT =
  /insert\s+into\s+platform_config\s*\(\s*"key"\s*,\s*"value"\s*\)\s*values\s*\(\s*'([^']+)'\s*,\s*'([^']*)'::jsonb\s*\)/gi;

test("the harness defaults are exactly what the migrations seed", async () => {
  // Replay every seeding insert in filename order — later migrations win, so
  // this is the table a database that has only ever been migrated holds.
  const seeded: Record<string, unknown> = {};
  for (const { sql } of await migrationStatements()) {
    for (const [, key, json] of sql.matchAll(SEED_INSERT)) {
      seeded[key as string] = JSON.parse(json as string);
    }
  }

  expect(PLATFORM_CONFIG_DEFAULTS).toEqual(seeded);
});

test("every migration that touches platform_config is one the replay reads", async () => {
  // The replay recognises one insert shape; the reset DELETES anything it
  // doesn't produce. So a seed written another way — unquoted identifiers, an
  // `update`, an escaped apostrophe in a Ukrainian label — would be wiped from
  // every run with the drift check above still green. Fail here instead, at the
  // migration that introduced it: teach SEED_INSERT the shape, then add the key
  // to PLATFORM_CONFIG_DEFAULTS.
  const unreadable = (await migrationStatements()).filter(({ sql }) => {
    const mentions = sql.match(
      /\b(insert\s+into|update|delete\s+from)\s+platform_config\b/gi,
    );
    return (mentions?.length ?? 0) !== (sql.match(SEED_INSERT)?.length ?? 0);
  });

  expect(unreadable.map((m) => m.file)).toEqual([]);
});

test("global setup is wired to run the reset", async () => {
  // The reset only defends a run if vitest actually calls it; every other test
  // here invokes it directly and would stay green without the wiring.
  const config = (await import("../vitest.config")).default;
  expect(config.test?.globalSetup).toContain("test/global-config-reset.ts");
});

test("a value a previous run left behind is reset to the default", async () => {
  await db`
    update platform_config
       set "value" = ${db.json({ ttlSeconds: 1, graceSeconds: 0 })}
     where "key" = 'qr_token'
  `;

  await resetPlatformConfig(db);

  expect((await readConfig(db)).qr_token).toEqual(
    PLATFORM_CONFIG_DEFAULTS.qr_token,
  );
});

test("a key a previous run deleted comes back, and one it invented does not", async () => {
  await db`delete from platform_config where "key" = 'manual_entry'`;
  await db`
    insert into platform_config ("key", "value")
    values ('leaked_by_a_previous_run', ${db.json({ nonsense: true })})
  `;

  await resetPlatformConfig(db);

  expect(await readConfig(db)).toEqual(PLATFORM_CONFIG_DEFAULTS);
});
