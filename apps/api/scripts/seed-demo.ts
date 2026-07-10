import { Pool } from "pg";
import { createAuth } from "../src/auth";
import { createDb } from "../src/db";
import { loadDotEnv, loadEnv } from "../src/env";

/**
 * Seed the LOCAL dev database with the demo fixtures every Argent/simulator
 * session assumes (docs/argent-howto.md): a CafeOwner, their Café, and a
 * Customer with a memorable member code sitting one Зернятко short of a
 * Reward — so a single scan demos the whole magic moment (earn → threshold →
 * redeem → Ворожка).
 *
 * Idempotent: existing accounts and ledger rows are kept (never duplicated);
 * only the demo Café's program and the Customer's member code are pinned to
 * known values on every run. Run it after `pnpm db:reset` — or any time — via
 * `pnpm db:seed-demo`.
 */

const OWNER = {
  email: "demo.owner@kavtsya.test",
  password: "demo-password-1",
  name: "Демо Кавовар",
};
const CUSTOMER = {
  email: "demo.customer@kavtsya.test",
  password: "demo-password-1",
  name: "Олена Демо",
};
const CAFE_NAME = "Кавярня «Демо»";
/** Crockford-valid, memorable, and printed on every run for manual entry (#21). */
const MEMBER_CODE = "KAVA2026";
/** Low threshold + seeded balance one short of it: the next scan can redeem. */
const THRESHOLD = 5;
const SEEDED_PURCHASES = THRESHOLD - 1;

loadDotEnv();
const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const authPool = new Pool({ connectionString: env.DATABASE_URL });
const auth = createAuth({
  database: authPool,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
});

/** The account's user id, signing it up through Better Auth if it's new. */
async function ensureAccount(account: typeof OWNER): Promise<string> {
  const [existing] = await db<{ id: string }[]>`
    select "id" from "user" where "email" = ${account.email}
  `;
  if (existing) return existing.id;

  await auth.api.signUpEmail({ body: account });
  const [created] = await db<{ id: string }[]>`
    select "id" from "user" where "email" = ${account.email}
  `;
  if (!created) throw new Error(`signup did not create ${account.email}`);
  console.log(`created account ${account.email}`);
  return created.id;
}

try {
  const ownerId = await ensureAccount(OWNER);
  const customerId = await ensureAccount(CUSTOMER);

  // The demo Café, with its program pinned so the demo state is predictable.
  // Select-first, not upsert: cafes has no unique (owner, name) constraint, so
  // an `on conflict do nothing` insert would duplicate the Café on every run.
  const [existingCafe] = await db<{ id: string }[]>`
    select "id" from cafes
    where "owner_user_id" = ${ownerId} and "name" = ${CAFE_NAME}
  `;
  const cafeId =
    existingCafe?.id ??
    (
      await db<{ id: string }[]>`
        insert into cafes ("name", "owner_user_id")
        values (${CAFE_NAME}, ${ownerId})
        returning "id"
      `
    )[0]!.id;
  await db`
    update cafes
    set "zernyatko_threshold" = ${THRESHOLD},
        "reward" = ${db.json({ type: "free_drink" })}
    where "id" = ${cafeId}
  `;

  // A stable, memorable member code (#21) — what you type on the scan screen.
  await db`
    update "user" set "member_code" = ${MEMBER_CODE} where "id" = ${customerId}
  `;

  // Seed the ledger only when this pair has no history at all, so re-runs
  // never inflate a balance someone is mid-demo with.
  const [{ count }] = await db<{ count: string }[]>`
    select count(*) from purchases
    where "customer_user_id" = ${customerId} and "cafe_id" = ${cafeId}
  `;
  if (Number(count) === 0) {
    for (let i = 1; i <= SEEDED_PURCHASES; i++) {
      await db`
        insert into purchases
          ("cafe_id", "customer_user_id", "qr_jti", "entry_source")
        values (${cafeId}, ${customerId}, ${`seed-demo-${i}`}, 'qr')
      `;
    }
    await db`
      insert into cafe_memberships ("cafe_id", "customer_user_id")
      values (${cafeId}, ${customerId})
      on conflict do nothing
    `;
    console.log(`seeded ${SEEDED_PURCHASES} purchases`);
  }

  const [{ balance }] = await db<{ balance: number }[]>`
    select
      (select count(*)::int from purchases
        where "customer_user_id" = ${customerId} and "cafe_id" = ${cafeId})
      - (select coalesce(sum("beans_spent"), 0)::int from redemptions
          where "customer_user_id" = ${customerId} and "cafe_id" = ${cafeId})
      as balance
  `;

  console.log(`
Demo world ready:
  CafeOwner  ${OWNER.email} / ${OWNER.password}   (${CAFE_NAME})
  Customer   ${CUSTOMER.email} / ${CUSTOMER.password}
  Member code ${MEMBER_CODE.slice(0, 4)}-${MEMBER_CODE.slice(4)}  (type it on the scan screen)
  Balance    ${balance} з ${THRESHOLD} — reward: безкоштовний напій`);
} finally {
  await authPool.end();
  await db.end();
}
