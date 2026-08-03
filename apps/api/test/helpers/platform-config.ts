import type { Database } from "../../src/db";

/**
 * Run a test body with a `platform_config` key temporarily overridden, then
 * restore the original value no matter how the body exits.
 *
 * The test database persists across runs and `platform_config` is deliberately
 * NOT truncated (it holds migration-seeded values), so a mutation that escapes
 * a test poisons the NEXT `vitest run`, not the current one — a failure mode
 * that looks like an unrelated suite breaking a day later (#21 hit this with
 * the manual-entry ceiling). Every config-tuning test must go through here.
 *
 * The write goes straight to the database, bypassing any app already reading
 * it. Since #54 each app instance owns its config cache, so build the app that
 * must observe the override INSIDE `body` — a reader started afterwards is
 * cold and reads the row. (An app built earlier would keep serving the old
 * value until its TTL, which is exactly what production does.)
 */
export async function withPlatformConfig(
  db: Database,
  key: string,
  value: unknown,
  body: () => Promise<void>,
): Promise<void> {
  const [original] = await db<{ value: unknown }[]>`
    select "value" from platform_config where "key" = ${key}
  `;
  await db`
    insert into platform_config ("key", "value")
    values (${key}, ${db.json(value as never)})
    on conflict ("key") do update set "value" = excluded."value"
  `;

  try {
    await body();
  } finally {
    if (original) {
      await db`
        update platform_config set "value" = ${db.json(original.value as never)}
        where "key" = ${key}
      `;
    } else {
      await db`delete from platform_config where "key" = ${key}`;
    }
  }
}
