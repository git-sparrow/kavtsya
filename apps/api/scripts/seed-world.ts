import { Pool } from "pg";
import { createAuth } from "../src/auth";
import type { Auth } from "../src/auth";
import { KYIV_TIME_ZONE } from "@kavtsya/shared";
import { kyivDaySql } from "../src/clock";
import { createDb } from "../src/db";
import type { Database } from "../src/db";
import { loadDotEnv, loadEnv } from "../src/env";

/**
 * The defined demo world every Argent/simulator and `/verify` session assumes
 * (docs/argent-howto.md). One small, named, idempotent fixture — the source of
 * truth for "what accounts exist" — so a scenario is reached by signing in as a
 * purpose-named account, never by hand-editing rows.
 *
 * Two ways in:
 *   - `seed-demo`       — additive/idempotent; safe to re-run mid-demo.
 *   - `seed-demo-fresh` — {@link wipeAll} then re-seed; the clean-slate reset
 *                         that clears accreted junk from past verify runs.
 *
 * Every account shares one password so the set is memorable; the email encodes
 * the account's single purpose. Login-less synthetic customers (`hist-*`) carry
 * the Pro café's analytics history — they are never signed into, so they skip
 * Better Auth and exist only as ledger fk targets.
 */

/** One password across the whole demo world — memorable, never a real secret. */
export const DEMO_PASSWORD = "demo-password-1";

interface AccountDef {
  email: string;
  password: string;
  name: string;
}

// The guided happy path (kept pristine — /verify's core earn→redeem→Ворожка).
const DEMO_OWNER: AccountDef = {
  email: "demo.owner@kavtsya.test",
  password: DEMO_PASSWORD,
  name: "Демо Кавовар",
};
const DEMO_CUSTOMER: AccountDef = {
  email: "demo.customer@kavtsya.test",
  password: DEMO_PASSWORD,
  name: "Олена Демо",
};
// Pro owner: the unlocked side of every Plan gate + rich analytics history.
const PRO_OWNER: AccountDef = {
  email: "pro.owner@kavtsya.test",
  password: DEMO_PASSWORD,
  name: "Про Кавовар",
};
// A Customer trusted on the Pro café's roster — the Barista of Зміна/#80.
const BARISTA: AccountDef = {
  email: "barista@kavtsya.test",
  password: DEMO_PASSWORD,
  name: "Барист Демо",
};
// Empty-state accounts: a brand-new owner (no café) and customer (no зернята).
const NEW_OWNER: AccountDef = {
  email: "new.owner@kavtsya.test",
  password: DEMO_PASSWORD,
  name: "Новий Кавовар",
};
const NEW_CUSTOMER: AccountDef = {
  email: "new.customer@kavtsya.test",
  password: DEMO_PASSWORD,
  name: "Новий Клієнт",
};

interface CafeDef {
  name: string;
  threshold: number;
  /** Crockford base32, 8 chars (no I/L/O/U) — stable across runs, unique. */
  poster: string;
  plan: "free" | "pro";
}

const DEMO_CAFE: CafeDef = {
  name: "Кавярня «Демо»",
  threshold: 5,
  poster: "PSTR2026",
  plan: "free",
};
const PRO_CAFE: CafeDef = {
  name: "Кавярня «Про»",
  threshold: 6,
  poster: "PRWA2026",
  plan: "pro",
};

/** Memorable, Crockford-valid member codes for the customer-facing accounts. */
const MEMBER_CODES = {
  demoCustomer: "KAVA2026",
  barista: "BRST2026",
  newCustomer: "NEWC2026",
} as const;

/** One backdated Purchase for the Pro café's analytics history. */
interface HistoryEntry {
  customer: string;
  daysAgo: number;
  hour: number;
}

/**
 * The Pro café's ledger history — five login-less customers spread across Kyiv
 * days and hours so peak-hours and the new-vs-repeat split are both non-trivial
 * in either window. `hist-1/2/5` first visit before the 30d window (repeat);
 * `hist-3/4` first visit inside it (new). Hour 19 is left the busiest.
 */
const HISTORY_CUSTOMERS = [
  { id: "hist-1", name: "Оксана" },
  { id: "hist-2", name: "Богдан" },
  { id: "hist-3", name: "Ірина" },
  { id: "hist-4", name: "Тарас" },
  { id: "hist-5", name: "Марія" },
] as const;

const HISTORY: HistoryEntry[] = [
  { customer: "hist-1", daysAgo: 45, hour: 9 },
  { customer: "hist-1", daysAgo: 20, hour: 8 },
  { customer: "hist-1", daysAgo: 5, hour: 17 },
  { customer: "hist-1", daysAgo: 2, hour: 9 },
  { customer: "hist-2", daysAgo: 60, hour: 18 },
  { customer: "hist-2", daysAgo: 12, hour: 8 },
  { customer: "hist-2", daysAgo: 3, hour: 18 },
  { customer: "hist-2", daysAgo: 1, hour: 19 },
  { customer: "hist-3", daysAgo: 5, hour: 13 },
  { customer: "hist-3", daysAgo: 4, hour: 12 },
  { customer: "hist-3", daysAgo: 1, hour: 9 },
  { customer: "hist-4", daysAgo: 2, hour: 19 },
  { customer: "hist-4", daysAgo: 1, hour: 19 },
  { customer: "hist-5", daysAgo: 40, hour: 8 },
  { customer: "hist-5", daysAgo: 6, hour: 19 },
  { customer: "hist-5", daysAgo: 1, hour: 8 },
];

/** The account's user id, signing it up through Better Auth if it's new. */
async function ensureAccount(
  db: Database,
  auth: Auth,
  account: AccountDef,
): Promise<string> {
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

/**
 * A login-less Customer used only as a ledger fk (analytics history). No
 * `account` row, so it can never sign in — it exists to give the Pro café a
 * realistic multi-customer history without minting real credentials.
 */
async function ensureSyntheticCustomer(
  db: Database,
  id: string,
  name: string,
): Promise<void> {
  await db`
    insert into "user" ("id", "name", "email", "emailVerified")
    values (${id}, ${name}, ${`${id}@seed.local`}, true)
    on conflict ("id") do nothing
  `;
}

async function pinMemberCode(
  db: Database,
  userId: string,
  code: string,
): Promise<void> {
  await db`update "user" set "member_code" = ${code} where "id" = ${userId}`;
}

/**
 * The owner's Café, its program pinned so the demo state is predictable.
 * Select-first, not upsert: cafes has no unique (owner, name) constraint, so an
 * `on conflict do nothing` insert would duplicate the Café on every run.
 */
async function ensureCafe(
  db: Database,
  ownerId: string,
  cafe: CafeDef,
): Promise<string> {
  const [existing] = await db<{ id: string }[]>`
    select "id" from cafes
    where "owner_user_id" = ${ownerId} and "name" = ${cafe.name}
  `;
  const cafeId =
    existing?.id ??
    (
      await db<{ id: string }[]>`
        insert into cafes ("name", "owner_user_id", "poster_code")
        values (${cafe.name}, ${ownerId}, ${cafe.poster})
        returning "id"
      `
    )[0]!.id;
  await db`
    update cafes
    set "zernyatko_threshold" = ${cafe.threshold},
        "reward" = ${db.json({ type: "free_drink" })},
        "poster_code" = ${cafe.poster},
        "plan" = ${cafe.plan}
    where "id" = ${cafeId}
  `;
  return cafeId;
}

/**
 * Seed `count` Purchases + a membership for a pair only when they have no
 * history at all, so re-runs never inflate a balance someone is mid-demo with.
 */
async function ensureLedger(
  db: Database,
  cafeId: string,
  customerId: string,
  count: number,
  jtiPrefix: string,
): Promise<void> {
  const [existing] = await db<{ count: string }[]>`
    select count(*) from purchases
    where "customer_user_id" = ${customerId} and "cafe_id" = ${cafeId}
  `;
  if (Number(existing?.count ?? 0) > 0) return;
  for (let i = 1; i <= count; i++) {
    await db`
      insert into purchases
        ("cafe_id", "customer_user_id", "qr_jti", "entry_source")
      values (${cafeId}, ${customerId}, ${`${jtiPrefix}-${i}`}, 'qr')
    `;
  }
  await db`
    insert into cafe_memberships ("cafe_id", "customer_user_id")
    values (${cafeId}, ${customerId})
    on conflict do nothing
  `;
}

/** Put a Customer on the Café's roster as an approved (trusted) Barista. */
async function ensureRostered(
  db: Database,
  cafeId: string,
  userId: string,
  approvedBy: string,
): Promise<void> {
  await db`
    insert into cafe_barista_roster
      ("cafe_id", "user_id", "status", "requested_at", "approved_at", "approved_by")
    values (
      ${cafeId}, ${userId}, 'rostered',
      now() - interval '2 days', now() - interval '2 days', ${approvedBy}
    )
    on conflict ("cafe_id", "user_id") do update
      set "status" = 'rostered',
          "approved_at" = excluded."approved_at",
          "approved_by" = excluded."approved_by"
  `;
}

/**
 * The Pro café's backdated history (idempotent via the unique `qr_jti`).
 * `created_at` is built by interpreting a naive "N Kyiv-days ago at hour H" as
 * Europe/Kyiv (DST-correct) — landing rows in the same buckets `kyivDaySql`
 * reads them back out of. The trailing `at time zone` is the INVERSE conversion
 * (Kyiv wall-clock → instant), which no query needs and so has no fragment; it
 * names the zone from the same constant, so nothing here can drift either.
 */
async function seedHistory(
  db: Database,
  cafeId: string,
  entries: HistoryEntry[],
): Promise<void> {
  for (const [i, e] of entries.entries()) {
    await db`
      insert into purchases
        ("cafe_id", "customer_user_id", "qr_jti", "entry_source", "created_at")
      values (
        ${cafeId}, ${e.customer}, ${`seed-hist-${i}`}, 'qr',
        (((${kyivDaySql(db, db`now()`)} - ${e.daysAgo}::int)
          + make_time(${e.hour}::int, 0, 0)) at time zone ${KYIV_TIME_ZONE})
      )
      on conflict ("qr_jti") do nothing
    `;
  }
}

/**
 * Truncate every data table (keeping schema + migrations + platform_config) so
 * a fresh seed starts from a clean, junk-free world. CASCADE covers fk order.
 */
export async function wipeAll(db: Database): Promise<void> {
  await db.unsafe(`
    truncate table
      account, session, verification,
      purchases, redemptions, fortunes,
      cafe_memberships, cafe_barista_roster, cafe_scanner_grants,
      campaigns, push_tickets, push_tokens,
      cafes, "user"
    restart identity cascade
  `);
  console.log("wiped all data tables");
}

/** Create/pin the whole defined demo world. Idempotent. */
export async function seedWorld(db: Database, auth: Auth): Promise<void> {
  // Core happy path.
  const demoOwnerId = await ensureAccount(db, auth, DEMO_OWNER);
  const demoCustomerId = await ensureAccount(db, auth, DEMO_CUSTOMER);
  const demoCafeId = await ensureCafe(db, demoOwnerId, DEMO_CAFE);
  await pinMemberCode(db, demoCustomerId, MEMBER_CODES.demoCustomer);
  await ensureLedger(
    db,
    demoCafeId,
    demoCustomerId,
    DEMO_CAFE.threshold - 1,
    "seed-demo",
  );

  // Pro owner + a rich Pro café: the unlocked side of the Plan gates.
  const proOwnerId = await ensureAccount(db, auth, PRO_OWNER);
  const proCafeId = await ensureCafe(db, proOwnerId, PRO_CAFE);
  for (const c of HISTORY_CUSTOMERS) {
    await ensureSyntheticCustomer(db, c.id, c.name);
    await db`
      insert into cafe_memberships ("cafe_id", "customer_user_id")
      values (${proCafeId}, ${c.id})
      on conflict do nothing
    `;
  }
  await seedHistory(db, proCafeId, HISTORY);

  // A trusted Barista on the Pro café's roster (Зміна / scanner grants).
  const baristaId = await ensureAccount(db, auth, BARISTA);
  await pinMemberCode(db, baristaId, MEMBER_CODES.barista);
  await ensureRostered(db, proCafeId, baristaId, proOwnerId);

  // Empty-state accounts.
  await ensureAccount(db, auth, NEW_OWNER);
  const newCustomerId = await ensureAccount(db, auth, NEW_CUSTOMER);
  await pinMemberCode(db, newCustomerId, MEMBER_CODES.newCustomer);

  const [demoBalance] = await db<{ balance: number }[]>`
    select
      (select count(*)::int from purchases
        where "customer_user_id" = ${demoCustomerId} and "cafe_id" = ${demoCafeId})
      - (select coalesce(sum("beans_spent"), 0)::int from redemptions
          where "customer_user_id" = ${demoCustomerId} and "cafe_id" = ${demoCafeId})
      as balance
  `;

  const code = (c: string): string => `${c.slice(0, 4)}-${c.slice(4)}`;
  console.log(`
Demo world ready (password for all: ${DEMO_PASSWORD}):

  Core loop
    ${DEMO_OWNER.email}      — Free café «${DEMO_CAFE.name}» (gating pitch side)
    ${DEMO_CUSTOMER.email}   — ${demoBalance?.balance ?? 0}/${DEMO_CAFE.threshold} at «${DEMO_CAFE.name}», code ${code(MEMBER_CODES.demoCustomer)}

  Roles & states
    ${PRO_OWNER.email}       — Pro café «${PRO_CAFE.name}» + analytics history
    ${BARISTA.email}         — rostered Barista at «${PRO_CAFE.name}», code ${code(MEMBER_CODES.barista)}
    ${NEW_OWNER.email}       — no café (register-café / empty owner state)
    ${NEW_CUSTOMER.email}    — no зернята (empty customer state), code ${code(MEMBER_CODES.newCustomer)}`);
}

/**
 * Wire up the process deps (env, postgres.js, Better Auth's pg Pool), run the
 * given seed step, and always close both connections — the shared entry both
 * `seed-demo` and `seed-demo-fresh` call.
 */
export async function runSeed(
  step: (db: Database, auth: Auth) => Promise<void>,
): Promise<void> {
  loadDotEnv();
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL);
  const authPool = new Pool({ connectionString: env.DATABASE_URL });
  const auth = createAuth({
    database: authPool,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
  });
  try {
    await step(db, auth);
  } finally {
    await authPool.end();
    await db.end();
  }
}
