import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import {
  memberCodeResponseSchema,
  purchaseResultSchema,
} from "@kavtsya/shared";
import type { Auth } from "../src/auth";
import type { Database } from "../src/db";
import { clearPlatformConfigCache } from "../src/platform-config";
import { makeApp, registerCafe as registerCafeAt, signUp } from "./helpers/app";
import { setupTestAuth, setupTestDb } from "./helpers/testDb";

/**
 * The offline fallback (#21): the CafeOwner types the Customer's member code
 * instead of scanning the QR — same endpoint, same ledger, same guards, same
 * success contract. These tests drive the manual arm of the body union;
 * `purchases.test.ts` owns the QR arm.
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
  clearPlatformConfigCache();
});

function app() {
  return makeApp({ db, auth });
}

function registerCafe(name: string, cookie: string): Promise<string> {
  return registerCafeAt(app(), name, cookie);
}

/** The Customer's stable member code — what they read aloud at the counter. */
async function memberCodeFor(cookie: string): Promise<string> {
  const res = await app().request("/api/me/member-code", {
    headers: { cookie },
  });
  expect(res.status).toBe(200);
  return memberCodeResponseSchema.parse(await res.json()).memberCode;
}

function issueManual(body: unknown, cookie?: string) {
  return app().request("/api/purchases", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

// --- parity with the scan (#21: the offline path isn't second-class) ------------

test("a typed member code issues the same Зернятко as a scan — first visit included", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Кавця в підвалі", owner);
  const customer = await signUp(app(), "customer@example.com");
  const memberCode = await memberCodeFor(customer);

  // First-ever Purchase at this Café arrives manually: no membership row
  // exists yet — the ceiling path must create and lock it, not trip over it.
  const res = await issueManual({ cafeId, memberCode }, owner);

  expect(res.status).toBe(201);
  const result = purchaseResultSchema.parse(await res.json());
  expect(result).toEqual({
    customerId: expect.any(String),
    customerName: "Test",
    balance: 1,
    threshold: 10,
    reward: null,
    // The Ворожка rides along (#23): the offline path keeps the brand moment.
    fortune: expect.any(String),
  });
});

// --- normalization: fast counter-typing still works (#21) -----------------------

test("lowercase, hyphenated, spaced input resolves to the same Customer", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Кавця", owner);
  const customer = await signUp(app(), "customer@example.com");
  const code = await memberCodeFor(customer);
  // The code as a hurried barista types it: grouped like the display
  // (XXXX-XXXX), lowercase, with a stray space.
  const typed = ` ${code.slice(0, 4).toLowerCase()}-${code.slice(4).toLowerCase()} `;

  const res = await issueManual({ cafeId, memberCode: typed }, owner);

  expect(res.status).toBe(201);
  expect(purchaseResultSchema.parse(await res.json()).balance).toBe(1);
});

test("a well-formed code nobody holds asks the CafeOwner to re-read it", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Кавця", owner);

  // Valid alphabet, valid length — just not minted (~40 bits make a lucky
  // guess implausible enough for a fixed literal).
  const res = await issueManual({ cafeId, memberCode: "AAAA-2222" }, owner);

  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "unknown_member_code" });
});

// --- redeem-after works identically (#22 needs zero changes) --------------------

test("Redemption keys off the manual issuance result exactly as off a scan", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Кавця", owner);
  // Threshold 1 with a Reward: the very first Зернятко earns a redemption.
  const programRes = await app().request(`/api/cafes/${cafeId}/program`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: owner },
    body: JSON.stringify({ threshold: 1, reward: { type: "free_drink" } }),
  });
  expect(programRes.status).toBe(200);
  const customer = await signUp(app(), "customer@example.com");
  const memberCode = await memberCodeFor(customer);

  const issued = await issueManual({ cafeId, memberCode }, owner);
  expect(issued.status).toBe(201);
  const { customerId } = purchaseResultSchema.parse(await issued.json());

  // The confirm uses the Customer identity from the issuance result — the
  // manual path populated it identically, so no token is ever needed (#21).
  const redeemed = await app().request("/api/redemptions", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: owner },
    body: JSON.stringify({ cafeId, customerId, idempotencyKey: "counter-1" }),
  });

  expect(redeemed.status).toBe(201);
  expect(await redeemed.json()).toEqual({
    balance: 0,
    beansSpent: 1,
    reward: { type: "free_drink" },
  });
});
