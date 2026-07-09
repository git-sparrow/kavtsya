import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { LoyaltyProgram } from "@kavtsya/shared";
import {
  cafeBalancesResponseSchema,
  purchaseResultSchema,
  redemptionResultSchema,
} from "@kavtsya/shared";
import type { Auth } from "../src/auth";
import type { Database } from "../src/db";
import { clearPlatformConfigCache } from "../src/platform-config";
import { makeApp, registerCafe as registerCafeAt, signUp } from "./helpers/app";
import { setupTestAuth, setupTestDb } from "./helpers/testDb";

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

/** Configure the Café's program — Redemption needs a Reward to claim. */
async function setProgram(
  cafeId: string,
  cookie: string,
  program: LoyaltyProgram,
): Promise<void> {
  const res = await app().request(`/api/cafes/${cafeId}/program`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(program),
  });
  expect(res.status).toBe(200);
}

/**
 * One full earn round via the HTTP seam: the Customer's rotating QR is fetched
 * and the CafeOwner scans it. Returns the scan result — including `customerId`,
 * which is what the Redemption confirm is keyed on (one scan, two actions).
 */
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

function confirmRedemption(body: unknown, cookie?: string) {
  return app().request("/api/redemptions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

// --- confirming a Redemption ----------------------------------------------------

test("a Redemption subtracts the threshold, preserving leftover Зернятка", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Кавця", owner);
  await setProgram(cafeId, owner, {
    threshold: 3,
    reward: { type: "free_drink" },
  });
  const customer = await signUp(app(), "customer@example.com");
  let scan;
  for (let i = 0; i < 4; i++) scan = await earn(cafeId, owner, customer);

  const res = await confirmRedemption(
    { cafeId, customerId: scan!.customerId, idempotencyKey: "confirm-1" },
    owner,
  );

  expect(res.status).toBe(201);
  // CONTEXT → Redemption: balance 4, threshold 3 → 1; subtract, not reset to 0.
  expect(redemptionResultSchema.parse(await res.json())).toEqual({
    balance: 1,
    beansSpent: 3,
    reward: { type: "free_drink" },
  });
});

test("a balance of 2× the threshold banks two Redemptions; a third is rejected", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Кавця", owner);
  await setProgram(cafeId, owner, {
    threshold: 3,
    reward: { type: "free_drink" },
  });
  const customer = await signUp(app(), "customer@example.com");
  let scan;
  for (let i = 0; i < 6; i++) scan = await earn(cafeId, owner, customer);
  const customerId = scan!.customerId;

  // Each banked Redemption is its own distinct confirm with its own key.
  const first = await confirmRedemption(
    { cafeId, customerId, idempotencyKey: "confirm-1" },
    owner,
  );
  const second = await confirmRedemption(
    { cafeId, customerId, idempotencyKey: "confirm-2" },
    owner,
  );
  const third = await confirmRedemption(
    { cafeId, customerId, idempotencyKey: "confirm-3" },
    owner,
  );

  expect(first.status).toBe(201);
  expect(redemptionResultSchema.parse(await first.json()).balance).toBe(3);
  expect(second.status).toBe(201);
  expect(redemptionResultSchema.parse(await second.json()).balance).toBe(0);
  expect(third.status).toBe(409);
  expect(await third.json()).toEqual({ error: "insufficient_balance" });
});

test("a repeated confirm with the same idempotency key replays, never double-spends", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Кавця", owner);
  await setProgram(cafeId, owner, {
    threshold: 3,
    reward: { type: "free_drink" },
  });
  const customer = await signUp(app(), "customer@example.com");
  let scan;
  for (let i = 0; i < 6; i++) scan = await earn(cafeId, owner, customer);
  const body = {
    cafeId,
    customerId: scan!.customerId,
    idempotencyKey: "flaky-tap",
  };

  const first = await confirmRedemption(body, owner);
  const retry = await confirmRedemption(body, owner);

  expect(first.status).toBe(201);
  // The retry answers with the stored outcome (200, not a fresh 201)...
  expect(retry.status).toBe(200);
  expect(redemptionResultSchema.parse(await retry.json())).toEqual({
    balance: 3,
    beansSpent: 3,
    reward: { type: "free_drink" },
  });
  // ...and the ledger spent the threshold exactly once: balance 6 − 3, not 0.
  const balances = await app().request("/api/me/balances", {
    headers: { cookie: customer },
  });
  const [atCafe] = cafeBalancesResponseSchema.parse(await balances.json());
  expect(atCafe?.balance).toBe(3);
});

test("beans_spent and Reward are snapshotted at confirm time; a later program change never re-prices", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Кавця", owner);
  await setProgram(cafeId, owner, {
    threshold: 3,
    reward: { type: "free_drink" },
  });
  const customer = await signUp(app(), "customer@example.com");
  let scan;
  for (let i = 0; i < 7; i++) scan = await earn(cafeId, owner, customer);
  const customerId = scan!.customerId;
  const confirmed = await confirmRedemption(
    { cafeId, customerId, idempotencyKey: "before-change" },
    owner,
  );
  expect(confirmed.status).toBe(201);

  // The CafeOwner re-prices the program: threshold 5, a different Reward.
  await setProgram(cafeId, owner, {
    threshold: 5,
    reward: { type: "percent_discount", percent: 10 },
  });

  // The past Redemption still spent 3: balance stays 7 − 3 = 4 (were history
  // re-priced to the new threshold it would read 7 − 5 = 2).
  const balances = await app().request("/api/me/balances", {
    headers: { cookie: customer },
  });
  const [atCafe] = cafeBalancesResponseSchema.parse(await balances.json());
  expect(atCafe?.balance).toBe(4);
  // A retry of the old key replays the ORIGINAL snapshot, not today's program.
  const replay = await confirmRedemption(
    { cafeId, customerId, idempotencyKey: "before-change" },
    owner,
  );
  expect(replay.status).toBe(200);
  const replayed = redemptionResultSchema.parse(await replay.json());
  expect(replayed.beansSpent).toBe(3);
  expect(replayed.reward).toEqual({ type: "free_drink" });
  // A fresh confirm spends today's threshold and Reward: 4 − 5 is short...
  const short = await confirmRedemption(
    { cafeId, customerId, idempotencyKey: "after-change" },
    owner,
  );
  expect(short.status).toBe(409);
  // ...until one more Зернятко lands, then the new snapshot applies.
  await earn(cafeId, owner, customer);
  const fresh = await confirmRedemption(
    { cafeId, customerId, idempotencyKey: "after-change-2" },
    owner,
  );
  expect(fresh.status).toBe(201);
  expect(redemptionResultSchema.parse(await fresh.json())).toEqual({
    balance: 0,
    beansSpent: 5,
    reward: { type: "percent_discount", percent: 10 },
  });
});

test("two concurrent confirms (distinct keys) cannot overdraw: the lock serializes them", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Кавця", owner);
  await setProgram(cafeId, owner, {
    threshold: 3,
    reward: { type: "free_drink" },
  });
  const customer = await signUp(app(), "customer@example.com");
  let scan;
  for (let i = 0; i < 3; i++) scan = await earn(cafeId, owner, customer);
  const customerId = scan!.customerId;

  // Two devices confirm at once — distinct keys, so idempotency can't help;
  // only the membership-row lock (ADR 0010) stands between them and −3.
  const [a, b] = await Promise.all([
    confirmRedemption(
      { cafeId, customerId, idempotencyKey: "device-a" },
      owner,
    ),
    confirmRedemption(
      { cafeId, customerId, idempotencyKey: "device-b" },
      owner,
    ),
  ]);

  const statuses = [a.status, b.status].sort();
  expect(statuses).toEqual([201, 409]);
  const balances = await app().request("/api/me/balances", {
    headers: { cookie: customer },
  });
  const [atCafe] = cafeBalancesResponseSchema.parse(await balances.json());
  expect(atCafe?.balance).toBe(0);
});

// --- rejections -----------------------------------------------------------------

test("a Café with no Reward configured has nothing to claim", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Кавця", owner); // default program: reward null
  await setProgram(cafeId, owner, { threshold: 1, reward: null });
  const customer = await signUp(app(), "customer@example.com");
  const scan = await earn(cafeId, owner, customer);

  const res = await confirmRedemption(
    { cafeId, customerId: scan.customerId, idempotencyKey: "k" },
    owner,
  );

  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ error: "no_reward" });
});

test("a CafeOwner cannot redeem at their own Café (self-farming guard)", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Кавця", owner);
  const meRes = await app().request("/api/me", { headers: { cookie: owner } });
  const { id: ownerId } = (await meRes.json()) as { id: string };

  const res = await confirmRedemption(
    { cafeId, customerId: ownerId, idempotencyKey: "k" },
    owner,
  );

  expect(res.status).toBe(403);
  expect(await res.json()).toEqual({ error: "own_cafe" });
});

test("confirming at a Café the caller does not own is not found", async () => {
  const alice = await signUp(app(), "alice@example.com");
  const bob = await signUp(app(), "bob@example.com");
  const aliceCafe = await registerCafe("Кавця Аліси", alice);
  const customer = await signUp(app(), "customer@example.com");
  const scan = await earn(aliceCafe, alice, customer);

  const res = await confirmRedemption(
    { cafeId: aliceCafe, customerId: scan.customerId, idempotencyKey: "k" },
    bob,
  );

  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "not_found" });
});

test("a Customer with no Purchases at the Café has nothing to redeem", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Кавця", owner);
  await setProgram(cafeId, owner, {
    threshold: 3,
    reward: { type: "free_drink" },
  });
  const stranger = await signUp(app(), "stranger@example.com");
  const meRes = await app().request("/api/me", {
    headers: { cookie: stranger },
  });
  const { id: strangerId } = (await meRes.json()) as { id: string };

  const res = await confirmRedemption(
    { cafeId, customerId: strangerId, idempotencyKey: "k" },
    owner,
  );

  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ error: "insufficient_balance" });
});

test("confirming requires authentication", async () => {
  const res = await confirmRedemption({
    cafeId: "00000000-0000-0000-0000-000000000000",
    customerId: "someone",
    idempotencyKey: "k",
  });

  expect(res.status).toBe(401);
});

test("a malformed confirm body is rejected", async () => {
  const owner = await signUp(app(), "owner@example.com");

  const res = await confirmRedemption({ cafeId: "not-a-uuid" }, owner);

  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: "invalid_redemption" });
});

// --- the ledger is never rewritten (ADR 0014 ride-along) -------------------------

test("deleting an account no longer cascades away the Café's ledger", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Кавця", owner);
  const customer = await signUp(app(), "customer@example.com");
  const scan = await earn(cafeId, owner, customer);

  // Schema invariant pinned at the database seam: 0007 dropped ON DELETE
  // CASCADE, so a raw account delete is refused while Purchases point at it —
  // the deletion slice (#57/#58) must tombstone, never rewrite history.
  await expect(
    db`delete from "user" where "id" = ${scan.customerId}`,
  ).rejects.toMatchObject({ code: "23503" });
});
