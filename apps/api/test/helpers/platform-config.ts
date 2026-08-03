import type { Database } from "../../src/db";

/**
 * Temporarily change a `platform_config` key for the duration of a test body.
 *
 * The test database persists across runs and `platform_config` is deliberately
 * NOT truncated (it holds migration-seeded values), so a mutation that escapes
 * a test poisons the NEXT `vitest run`, not the current one — a failure mode
 * that looks like an unrelated suite breaking a day later (#21 hit this with
 * the manual-entry ceiling). Every config-tuning test must go through here.
 *
 * The write goes straight to the database, bypassing any app already reading
 * it. Since #54 each app instance owns its config cache, so build the app that
 * must observe the change INSIDE `body` — a reader started afterwards is cold
 * and reads the row. (An app built earlier would keep serving the old value
 * until its TTL, which is exactly what production does.)
 */

/**
 * Snapshot the key, apply `mutate`, run `body`, put the row back exactly as it
 * was however the body exits — restored by upsert, so it holds whether `mutate`
 * overwrote the row or deleted it.
 */
async function restoringPlatformConfig(
  db: Database,
  key: string,
  mutate: () => Promise<void>,
  body: () => Promise<void>,
): Promise<void> {
  const [original] = await db<{ value: unknown }[]>`
    select "value" from platform_config where "key" = ${key}
  `;
  await mutate();

  try {
    await body();
  } finally {
    if (original) {
      await db`
        insert into platform_config ("key", "value")
        values (${key}, ${db.json(original.value as never)})
        on conflict ("key") do update set "value" = excluded."value"
      `;
    } else {
      await db`delete from platform_config where "key" = ${key}`;
    }
  }
}

/** Run `body` with `key` overridden to `value` — the Platform tuning a knob. */
export function withPlatformConfig(
  db: Database,
  key: string,
  value: unknown,
  body: () => Promise<void>,
): Promise<void> {
  return restoringPlatformConfig(
    db,
    key,
    async () => {
      await db`
        insert into platform_config ("key", "value")
        values (${key}, ${db.json(value as never)})
        on conflict ("key") do update set "value" = excluded."value"
      `;
    },
    body,
  );
}

/**
 * Run `body` with `key` absent — a database whose seeding migration hasn't been
 * applied, which is the only way to exercise a reader's built-in fallback.
 */
export function withoutPlatformConfig(
  db: Database,
  key: string,
  body: () => Promise<void>,
): Promise<void> {
  return restoringPlatformConfig(
    db,
    key,
    async () => {
      await db`delete from platform_config where "key" = ${key}`;
    },
    body,
  );
}
