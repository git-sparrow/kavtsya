import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import {
  type AnalyticsSummary,
  analyticsSummarySchema,
  meResponseSchema,
} from "@kavtsya/shared";
import type { Auth } from "../src/auth";
import { fixedClock } from "../src/clock";
import type { Database } from "../src/db";
import { makeApp, registerCafe, signUp } from "./helpers/app";
import { setupTestAuth, setupTestDb } from "./helpers/testDb";

/**
 * Analytics (Pro, #25, ADR 0011): peak hours + repeat-vs-new Customers, derived
 * live from the Purchase ledger (ADR 0010). The Plan gate reuses #24's
 * `pro_required` code; the definitions are pinned here so the read layer can't
 * drift. The teaser stat rides on `/api/me` for Free and Pro owners alike and
 * must equal the 30-day summary's repeat count. Ledger rows are seeded directly
 * because audience/period recency needs backdated timestamps no public seam
 * mints — the same approach as the campaigns suite.
 */

let db: Database;
let auth: Auth;
let pool: Pool;

beforeAll(async () => {
  db = await setupTestDb();
  ({ auth, pool } = setupTestAuth());
});

afterAll(async () => {
  await pool?.end();
  await db?.end();
});

beforeEach(async () => {
  await db`truncate "user", "session", "account", "verification", cafes cascade`;
  await db`truncate fortunes`;
});

/** The v1 upgrade path: the Platform's hand on the flag (no billing, ADR 0011). */
async function makePro(cafeId: string): Promise<void> {
  await db`update cafes set "plan" = 'pro' where "id" = ${cafeId}`;
}

async function userIdOf(
  app: ReturnType<typeof makeApp>,
  cookie: string,
): Promise<string> {
  const res = await app.request("/api/me", { headers: { cookie } });
  const { id } = (await res.json()) as { id: string };
  return id;
}

/**
 * Seed one Purchase (+ its membership row, as the app path would) at a
 * controlled instant — the period and first-visit derivations need backdated
 * ledger rows.
 */
async function seedPurchase(
  cafeId: string,
  customerId: string,
  at: Date,
): Promise<void> {
  await db`
    insert into cafe_memberships ("cafe_id", "customer_user_id")
    values (${cafeId}, ${customerId}) on conflict do nothing
  `;
  await db`
    insert into purchases
      ("cafe_id", "customer_user_id", "qr_jti", "entry_source", "created_at")
    values
      (${cafeId}, ${customerId}, ${crypto.randomUUID()}, 'qr', ${at})
  `;
}

/** Mid-afternoon in Kyiv summer time — periods end on this Kyiv day. */
const NOW = new Date("2026-07-10T12:00:00Z");

function fetchAnalytics(
  app: ReturnType<typeof makeApp>,
  cafeId: string,
  cookie?: string,
  period?: string,
) {
  const query = period ? `?period=${period}` : "";
  return app.request(`/api/cafes/${cafeId}/analytics${query}`, {
    headers: { ...(cookie ? { cookie } : {}) },
  });
}

/** A Pro café owned by a fresh owner, plus the owner's cookie and id. */
async function proCafe(app: ReturnType<typeof makeApp>): Promise<{
  owner: string;
  cafeId: string;
}> {
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця", owner);
  await makePro(cafeId);
  return { owner, cafeId };
}

// --- the Pro gate --------------------------------------------------------------------

test("a Free café's analytics is refused with the upgrade code — gating is server-side", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(NOW) });
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця", owner);

  const res = await fetchAnalytics(app, cafeId, owner);

  expect(res.status).toBe(403);
  expect(await res.json()).toEqual({ error: "pro_required" });
});

test("an owner cannot read another café's analytics — a miss is indistinguishable", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(NOW) });
  const alice = await signUp(app, "alice@example.com");
  const aliceCafe = await registerCafe(app, "Кавця Аліси", alice);
  await makePro(aliceCafe);
  const bob = await signUp(app, "bob@example.com");

  const res = await fetchAnalytics(app, aliceCafe, bob);

  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "not_found" });
});

// --- the empty state -----------------------------------------------------------------

test("a brand-new Pro café reads all-zero: an honest empty state, not misleading charts", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(NOW) });
  const { owner, cafeId } = await proCafe(app);

  const res = await fetchAnalytics(app, cafeId, owner);

  expect(res.status).toBe(200);
  const summary = analyticsSummarySchema.parse(await res.json());
  expect(summary.period).toBe("30d");
  expect(summary.hourly).toEqual(new Array(24).fill(0));
  expect(summary.activeCustomers).toBe(0);
  expect(summary.newCustomers).toBe(0);
  expect(summary.repeatCustomers).toBe(0);
});

// --- the definitions: new / repeat / active -----------------------------------------

test("new + repeat = active, and each Customer lands on the right side of the period", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(NOW) });
  const { owner, cafeId } = await proCafe(app);

  // The 7d window ends 2026-07-10 (Kyiv), so its first Kyiv day is 2026-07-04.
  const insidePeriod = new Date("2026-07-08T09:00:00Z");
  const beforePeriod = new Date("2026-06-20T09:00:00Z");

  // Nadia: only ever visited inside the period → new.
  const nadia = await userIdOf(app, await signUp(app, "nadia@example.com"));
  await seedPurchase(cafeId, nadia, insidePeriod);

  // Petro: a visit before the period AND one inside → repeat (active).
  const petro = await userIdOf(app, await signUp(app, "petro@example.com"));
  await seedPurchase(cafeId, petro, beforePeriod);
  await seedPurchase(cafeId, petro, insidePeriod);

  // Olena: visited only before the period → not active at all, counted nowhere.
  const olena = await userIdOf(app, await signUp(app, "olena@example.com"));
  await seedPurchase(cafeId, olena, beforePeriod);

  const res = await fetchAnalytics(app, cafeId, owner, "7d");
  const summary = analyticsSummarySchema.parse(await res.json());

  expect(summary.newCustomers).toBe(1); // Nadia
  expect(summary.repeatCustomers).toBe(1); // Petro
  expect(summary.activeCustomers).toBe(2);
  expect(summary.newCustomers + summary.repeatCustomers).toBe(
    summary.activeCustomers,
  );
});

test("a first-ever visit exactly on the period's first Kyiv day counts as new", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(NOW) });
  const { owner, cafeId } = await proCafe(app);

  // 2026-07-04 00:30 Kyiv (EEST) = 2026-07-03 21:30 UTC — the first instant of
  // the 7d window's first Kyiv day. First-ever here must read as new, not repeat.
  const boundary = new Date("2026-07-03T21:30:00Z");
  const maryna = await userIdOf(app, await signUp(app, "maryna@example.com"));
  await seedPurchase(cafeId, maryna, boundary);

  const res = await fetchAnalytics(app, cafeId, owner, "7d");
  const summary = analyticsSummarySchema.parse(await res.json());

  expect(summary.newCustomers).toBe(1);
  expect(summary.repeatCustomers).toBe(0);
  expect(summary.activeCustomers).toBe(1);
});

// --- peak hours: Kyiv buckets --------------------------------------------------------

test("peak-hour buckets sum to the period's total Purchases", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(NOW) });
  const { owner, cafeId } = await proCafe(app);
  const c1 = await userIdOf(app, await signUp(app, "c1@example.com"));
  const c2 = await userIdOf(app, await signUp(app, "c2@example.com"));

  // Three Purchases inside the 7d window at two Kyiv hours.
  await seedPurchase(cafeId, c1, new Date("2026-07-08T06:00:00Z")); // 09:00 Kyiv
  await seedPurchase(cafeId, c1, new Date("2026-07-08T06:30:00Z")); // 09:00 Kyiv
  await seedPurchase(cafeId, c2, new Date("2026-07-09T15:00:00Z")); // 18:00 Kyiv

  const res = await fetchAnalytics(app, cafeId, owner, "7d");
  const summary = analyticsSummarySchema.parse(await res.json());

  const total = summary.hourly.reduce((a, b) => a + b, 0);
  expect(total).toBe(3);
  expect(summary.hourly[9]).toBe(2);
  expect(summary.hourly[18]).toBe(1);
});

test("hour bucketing is KYIV-local: a late-evening UTC Purchase lands on the next Kyiv hour/day", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(NOW) });
  const { owner, cafeId } = await proCafe(app);
  const late = await userIdOf(app, await signUp(app, "late@example.com"));

  // 2026-07-08 22:30 UTC = 2026-07-09 01:30 Kyiv (EEST): the UTC hour is 22,
  // the Kyiv hour is 1 — and it stays inside the 7d window on the Kyiv side.
  await seedPurchase(cafeId, late, new Date("2026-07-08T22:30:00Z"));

  const res = await fetchAnalytics(app, cafeId, owner, "7d");
  const summary = analyticsSummarySchema.parse(await res.json());

  expect(summary.hourly[1]).toBe(1);
  expect(summary.hourly[22]).toBe(0);
  expect(summary.activeCustomers).toBe(1);
});

test("the period boundary respects Kyiv midnight, not UTC", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(NOW) });
  const { owner, cafeId } = await proCafe(app);

  // 2026-07-03 21:30 UTC = 2026-07-04 00:30 Kyiv: just inside the 7d window.
  const inside = await userIdOf(app, await signUp(app, "inside@example.com"));
  await seedPurchase(cafeId, inside, new Date("2026-07-03T21:30:00Z"));

  // 2026-07-03 20:30 UTC = 2026-07-03 23:30 Kyiv: the Kyiv day before — out.
  const outside = await userIdOf(app, await signUp(app, "outside@example.com"));
  await seedPurchase(cafeId, outside, new Date("2026-07-03T20:30:00Z"));

  const res = await fetchAnalytics(app, cafeId, owner, "7d");
  const summary = analyticsSummarySchema.parse(await res.json());

  expect(summary.activeCustomers).toBe(1);
  expect(summary.hourly.reduce((a, b) => a + b, 0)).toBe(1);
});

// --- isolation -----------------------------------------------------------------------

test("another café's Purchases never leak into this café's numbers (ADR 0001)", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(NOW) });
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця", owner);
  const otherCafe = await registerCafe(app, "Інша кавця", owner);
  await makePro(cafeId);

  const someone = await userIdOf(app, await signUp(app, "someone@example.com"));
  await seedPurchase(otherCafe, someone, new Date("2026-07-08T09:00:00Z"));

  const res = await fetchAnalytics(app, cafeId, owner, "30d");
  const summary = analyticsSummarySchema.parse(await res.json());

  expect(summary.activeCustomers).toBe(0);
  expect(summary.hourly.reduce((a, b) => a + b, 0)).toBe(0);
});

test("the 7d and 30d presets see different windows of the same ledger", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(NOW) });
  const { owner, cafeId } = await proCafe(app);
  const c = await userIdOf(app, await signUp(app, "c@example.com"));

  // 20 Kyiv days ago: inside 30d, outside 7d.
  await seedPurchase(cafeId, c, new Date("2026-06-20T09:00:00Z"));

  const in30 = analyticsSummarySchema.parse(
    await (await fetchAnalytics(app, cafeId, owner, "30d")).json(),
  );
  const in7 = analyticsSummarySchema.parse(
    await (await fetchAnalytics(app, cafeId, owner, "7d")).json(),
  );

  expect(in30.activeCustomers).toBe(1);
  expect(in7.activeCustomers).toBe(0);
});

// --- the free teaser stat ------------------------------------------------------------

async function teaserFor(
  app: ReturnType<typeof makeApp>,
  cafeId: string,
  cookie: string,
): Promise<number> {
  const me = meResponseSchema.parse(
    await (await app.request("/api/me", { headers: { cookie } })).json(),
  );
  const cafe = me.cafes.find((entry) => entry.id === cafeId);
  if (!cafe) throw new Error("café not on /api/me");
  return cafe.returningCustomers30d;
}

test("the teaser rides on /api/me for a Free owner and equals the 30d repeat count", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(NOW) });
  // A Free café — the teaser is not gated.
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця", owner);

  // One returning Customer (before + inside), one purely-new — teaser counts
  // only the returning one.
  const returning = await userIdOf(app, await signUp(app, "back@example.com"));
  await seedPurchase(cafeId, returning, new Date("2026-06-01T09:00:00Z"));
  await seedPurchase(cafeId, returning, new Date("2026-07-08T09:00:00Z"));
  const fresh = await userIdOf(app, await signUp(app, "fresh@example.com"));
  await seedPurchase(cafeId, fresh, new Date("2026-07-08T09:00:00Z"));

  expect(await teaserFor(app, cafeId, owner)).toBe(1);
});

test("the teaser equals the Pro summary's repeatCustomers for the same 30d window", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(NOW) });
  const { owner, cafeId } = await proCafe(app);

  const returning = await userIdOf(app, await signUp(app, "r1@example.com"));
  await seedPurchase(cafeId, returning, new Date("2026-05-15T09:00:00Z"));
  await seedPurchase(cafeId, returning, new Date("2026-07-05T09:00:00Z"));
  const returning2 = await userIdOf(app, await signUp(app, "r2@example.com"));
  await seedPurchase(cafeId, returning2, new Date("2026-05-16T09:00:00Z"));
  await seedPurchase(cafeId, returning2, new Date("2026-07-06T09:00:00Z"));

  const summary: AnalyticsSummary = analyticsSummarySchema.parse(
    await (await fetchAnalytics(app, cafeId, owner, "30d")).json(),
  );
  const teaser = await teaserFor(app, cafeId, owner);

  expect(teaser).toBe(summary.repeatCustomers);
  expect(teaser).toBe(2);
});
