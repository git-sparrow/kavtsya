import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { purchaseResultSchema } from "@kavtsya/shared";
import type { Auth } from "../src/auth";
import type { Database } from "../src/db";
import { clearPlatformConfigCache } from "../src/platform-config";
import { findNegativeBalances } from "../src/purchases";
import { makeApp, registerCafe as registerCafeAt, signUp } from "./helpers/app";
import { setupTestAuth, setupTestDb } from "./helpers/testDb";

/**
 * The ledger-wide invariant from ADR 0010, promoted to a monitored check (#115):
 * no (Customer, Café) derived balance may ever be negative. This suite exercises
 * the real write paths — earning and redeeming through the HTTP seam, including
 * an overdraw the write path must refuse — and asserts {@link findNegativeBalances}
 * finds nothing. The negative control then forges an overdrawing Redemption row
 * directly to prove the detector actually catches a violation, so a green assert
 * above is evidence and not a vacuous truth. It shares that one query with
 * `scripts/check-ledger-invariant.ts`, the live-database consumer.
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
  // cascade also clears purchases, redemptions, and cafe_memberships.
  await db`truncate "user", "session", "account", "verification", cafes cascade`;
  clearPlatformConfigCache();
});

function app() {
  return makeApp({ db, auth });
}

function registerCafe(name: string, cookie: string): Promise<string> {
  return registerCafeAt(app(), name, cookie);
}

async function setProgram(
  cafeId: string,
  cookie: string,
  threshold: number,
): Promise<void> {
  const res = await app().request(`/api/cafes/${cafeId}/program`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ threshold, reward: { type: "free_drink" } }),
  });
  expect(res.status).toBe(200);
}

/** One earn round via the HTTP seam; returns the scan result (has `customerId`). */
async function earn(
  cafeId: string,
  ownerCookie: string,
  customerCookie: string,
) {
  const tokenRes = await app().request("/api/qr-token", {
    headers: { cookie: customerCookie },
  });
  expect(tokenRes.status).toBe(200);
  const { token } = (await tokenRes.json()) as { token: string };
  const res = await app().request("/api/purchases", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ cafeId, qrToken: token }),
  });
  expect(res.status).toBe(201);
  return purchaseResultSchema.parse(await res.json());
}

async function confirmRedemption(
  cafeId: string,
  customerId: string,
  idempotencyKey: string,
  ownerCookie: string,
) {
  return app().request("/api/redemptions", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ cafeId, customerId, idempotencyKey }),
  });
}

test("the invariant holds after the write paths exercise the ledger", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Кавця", owner);
  await setProgram(cafeId, owner, 3);

  // A Customer who banks two Rewards, leaving leftover Зернятка (never negative).
  const banker = await signUp(app(), "banker@example.com");
  let scan;
  for (let i = 0; i < 7; i++) scan = await earn(cafeId, owner, banker);
  const bankerId = scan!.customerId;
  expect(
    (await confirmRedemption(cafeId, bankerId, "banker-1", owner)).status,
  ).toBe(201);
  expect(
    (await confirmRedemption(cafeId, bankerId, "banker-2", owner)).status,
  ).toBe(201);

  // A Customer whose balance sits below the threshold, and whose confirm the
  // write path refuses — the overdraw the invariant exists to forbid.
  const shy = await signUp(app(), "shy@example.com");
  let shyScan;
  for (let i = 0; i < 2; i++) shyScan = await earn(cafeId, owner, shy);
  const refused = await confirmRedemption(
    cafeId,
    shyScan!.customerId,
    "shy-1",
    owner,
  );
  expect(refused.status).toBe(409);

  // A second Café: per-Café ledgers, never pooled (ADR 0001).
  const otherOwner = await signUp(app(), "other@example.com");
  const otherCafe = await registerCafe("Друга", otherOwner);
  await setProgram(otherCafe, otherOwner, 3);
  for (let i = 0; i < 4; i++) await earn(otherCafe, otherOwner, banker);

  await expect(findNegativeBalances(db)).resolves.toEqual([]);
});

test("the detector catches an overdrawn membership", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Кавця", owner);
  await setProgram(cafeId, owner, 3);
  const customer = await signUp(app(), "customer@example.com");
  let scan;
  for (let i = 0; i < 2; i++) scan = await earn(cafeId, owner, customer);
  const customerId = scan!.customerId;

  // Forge an overdraw the write path would never allow: spend more Зернятка than
  // the two earned. If the query missed this the green assert above would be
  // vacuous — a detector that can never fire is no invariant at all.
  await db`
    insert into redemptions
      ("cafe_id", "customer_user_id", "beans_spent", "reward", "idempotency_key")
    values
      (${cafeId}, ${customerId}, 5, ${db.json({ type: "free_drink" })}, 'forged-overdraw')
  `;

  await expect(findNegativeBalances(db)).resolves.toEqual([
    { cafeId, customerId, balance: -3 },
  ]);

  // Unlike sibling suites, this one cleans up: the forged overdraw would trip
  // the cross-suite invariant in `global-invariant.ts` if it happened to be the
  // last write before the run ends (file order isn't guaranteed).
  await db`delete from redemptions where "idempotency_key" = 'forged-overdraw'`;
});
