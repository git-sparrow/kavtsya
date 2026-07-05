import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import {
  cafeBalancesResponseSchema,
  purchaseResultSchema,
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
  // cascade also clears `purchases` (it references "user" and cafes).
  await db`truncate "user", "session", "account", "verification", cafes cascade`;
  clearPlatformConfigCache();
});

function app() {
  return makeApp({ db, auth });
}

function registerCafe(name: string, cookie: string): Promise<string> {
  return registerCafeAt(app(), name, cookie);
}

/** Fetch the Customer's rotating QR token — the thing the CafeOwner scans. */
async function qrTokenFor(cookie: string): Promise<string> {
  const res = await app().request("/api/qr-token", { headers: { cookie } });
  expect(res.status).toBe(200);
  const { token } = (await res.json()) as { token: string };
  return token;
}

function issuePurchase(body: unknown, cookie?: string) {
  return app().request("/api/purchases", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

// --- issuing a Зернятко ---------------------------------------------------------

test("a single scan identifies the Customer and issues one Зернятко", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Кавця на Подолі", owner);
  const customer = await signUp(app(), "customer@example.com");
  const qrToken = await qrTokenFor(customer);

  const res = await issuePurchase({ cafeId, qrToken }, owner);

  expect(res.status).toBe(201);
  const result = purchaseResultSchema.parse(await res.json());
  expect(result).toEqual({
    customerName: "Test",
    balance: 1,
    threshold: 10,
    reward: null,
  });
});

test("a re-scanned token is rejected and issues no second Зернятко", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Кавця", owner);
  const customer = await signUp(app(), "customer@example.com");
  const qrToken = await qrTokenFor(customer);
  expect((await issuePurchase({ cafeId, qrToken }, owner)).status).toBe(201);

  const rescan = await issuePurchase({ cafeId, qrToken }, owner);

  expect(rescan.status).toBe(409);
  expect(await rescan.json()).toEqual({ error: "token_used" });
  // The rejected re-scan appended nothing: one more fresh scan lands on 2, not 3.
  const fresh = await issuePurchase(
    { cafeId, qrToken: await qrTokenFor(customer) },
    owner,
  );
  expect(purchaseResultSchema.parse(await fresh.json()).balance).toBe(2);
});

test("a CafeOwner cannot earn Зернятка at their own Café (self-farming guard)", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Кавця", owner);
  const ownQrToken = await qrTokenFor(owner);

  const res = await issuePurchase({ cafeId, qrToken: ownQrToken }, owner);

  expect(res.status).toBe(403);
  expect(await res.json()).toEqual({ error: "own_cafe" });
});

test("a CafeOwner CAN earn Зернятка at someone else's Café", async () => {
  const alice = await signUp(app(), "alice@example.com");
  const bob = await signUp(app(), "bob@example.com");
  const bobsCafe = await registerCafe("Bob's Кавця", bob);
  await registerCafe("Alice's Кавця", alice);

  const res = await issuePurchase(
    { cafeId: bobsCafe, qrToken: await qrTokenFor(alice) },
    bob,
  );

  expect(res.status).toBe(201);
  expect(purchaseResultSchema.parse(await res.json()).balance).toBe(1);
});

test("an expired token is rejected with a distinct code for the scanner", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Кавця", owner);
  const customer = await signUp(app(), "customer@example.com");
  const qrToken = await qrTokenFor(customer);
  // Scan the (90s + 30s grace) token well past its life: two hours later.
  const later = makeApp({
    db,
    auth,
    clock: { now: () => new Date(Date.now() + 2 * 60 * 60 * 1000) },
  });

  const res = await later.request("/api/purchases", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: owner },
    body: JSON.stringify({ cafeId, qrToken }),
  });

  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "expired_token" });
});

test("a tampered token is rejected", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Кавця", owner);
  const customer = await signUp(app(), "customer@example.com");
  const qrToken = await qrTokenFor(customer);
  const tampered = qrToken.slice(0, -1) + (qrToken.endsWith("A") ? "B" : "A");

  const res = await issuePurchase({ cafeId, qrToken: tampered }, owner);

  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "invalid_token" });
});

test("issuing requires authentication", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Кавця", owner);
  const customer = await signUp(app(), "customer@example.com");

  const res = await issuePurchase({
    cafeId,
    qrToken: await qrTokenFor(customer),
  });

  expect(res.status).toBe(401);
});

test("issuing at a Café the caller does not own is not found", async () => {
  const alice = await signUp(app(), "alice@example.com");
  const bob = await signUp(app(), "bob@example.com");
  const aliceCafe = await registerCafe("Alice Café", alice);
  const customer = await signUp(app(), "customer@example.com");

  const res = await issuePurchase(
    { cafeId: aliceCafe, qrToken: await qrTokenFor(customer) },
    bob,
  );

  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "not_found" });
});

// --- the Customer's balances --------------------------------------------------

test("balances are independent per Café and listed most recently visited first", async () => {
  const alice = await signUp(app(), "alice@example.com");
  const bob = await signUp(app(), "bob@example.com");
  const aliceCafe = await registerCafe("Кавця Аліси", alice);
  const bobCafe = await registerCafe("Кавця Боба", bob);
  const customer = await signUp(app(), "customer@example.com");

  // Two Зернятка at Alice's, then one at Bob's.
  for (const [cafeId, cookie] of [
    [aliceCafe, alice],
    [aliceCafe, alice],
    [bobCafe, bob],
  ] as const) {
    const res = await issuePurchase(
      { cafeId, qrToken: await qrTokenFor(customer) },
      cookie,
    );
    expect(res.status).toBe(201);
  }

  const res = await app().request("/api/me/balances", {
    headers: { cookie: customer },
  });

  expect(res.status).toBe(200);
  const balances = cafeBalancesResponseSchema.parse(await res.json());
  expect(balances).toEqual([
    {
      cafeId: bobCafe,
      cafeName: "Кавця Боба",
      balance: 1,
      threshold: 10,
      reward: null,
    },
    {
      cafeId: aliceCafe,
      cafeName: "Кавця Аліси",
      balance: 2,
      threshold: 10,
      reward: null,
    },
  ]);
});

test("a Customer with no Purchases has no Café balances", async () => {
  const customer = await signUp(app(), "customer@example.com");

  const res = await app().request("/api/me/balances", {
    headers: { cookie: customer },
  });

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual([]);
});

test("reading balances requires authentication", async () => {
  const res = await app().request("/api/me/balances");

  expect(res.status).toBe(401);
});
