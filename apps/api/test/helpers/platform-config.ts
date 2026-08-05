import type { Database, Queryable } from "../../src/db";

/**
 * Everything the harness knows about `platform_config` (CONTEXT → Platform):
 * the shipped defaults, the run-scoped reset that restores them, and the
 * with-config helpers a test uses to tune a knob for one body.
 *
 * The test database persists across runs and `platform_config` is deliberately
 * NOT truncated per suite (it holds migration-seeded values every test leans
 * on), so isolation across runs is {@link resetPlatformConfig}'s job — global
 * setup calls it once before each run (#114). The with-config helpers below
 * scope a change to a test for the *current* run's sake; forgetting one is a
 * local mess, not a booby trap for tomorrow's run.
 */

/**
 * The table's shipped state — what a database that has only ever been migrated
 * holds. Hand-kept in sync with the seeding migrations (0004 `reward_defaults`,
 * 0005 `qr_token`, 0009 `manual_entry`, 0011 `campaigns`); this is NOT the
 * reader's fallback set in `src/platform-config.ts`, which deliberately differs
 * (a missing Reward set degrades to empty rather than to the sanctioned four).
 * `platform-config-defaults.test.ts` replays the migrations and fails if the
 * two ever drift.
 */
export const PLATFORM_CONFIG_DEFAULTS: Record<string, unknown> = {
  reward_defaults: [
    { type: "free_drink", label: "Безкоштовний напій" },
    { type: "free_specific_drink", label: "Безкоштовний обраний напій" },
    { type: "fixed_discount", label: "Фіксована знижка" },
    { type: "percent_discount", label: "Відсоткова знижка" },
  ],
  qr_token: { ttlSeconds: 90, graceSeconds: 30 },
  manual_entry: { dailyLimit: 3 },
  campaigns: { dailyLimit: 1 },
};

/** Write `key`, whether or not it is already there — the only write shape. */
function upsertPlatformConfig(
  db: Queryable,
  key: string,
  value: unknown,
): Promise<unknown> {
  return db`
    insert into platform_config ("key", "value")
    values (${key}, ${db.json(value as never)})
    on conflict ("key") do update set "value" = excluded."value"
  `;
}

/**
 * Put `platform_config` back to {@link PLATFORM_CONFIG_DEFAULTS}, whatever a
 * previous run left in it: overwritten values are restored, deleted keys come
 * back, and invented keys are dropped. All of it in one transaction, so no
 * suite ever observes a half-reset table.
 */
export async function resetPlatformConfig(db: Database): Promise<void> {
  const keys = Object.keys(PLATFORM_CONFIG_DEFAULTS);
  await db.begin(async (tx) => {
    await tx`delete from platform_config where "key" <> all(${tx.array(keys)})`;
    for (const key of keys) {
      await upsertPlatformConfig(tx, key, PLATFORM_CONFIG_DEFAULTS[key]);
    }
  });
}

/**
 * Temporarily change a `platform_config` key for the duration of a test body.
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
      await upsertPlatformConfig(db, key, original.value);
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
      await upsertPlatformConfig(db, key, value);
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
