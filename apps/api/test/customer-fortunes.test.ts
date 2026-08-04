import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { pendingFortuneResponseSchema } from "@kavtsya/shared";
import type { Auth } from "../src/auth";
import type { Database } from "../src/db";
import { makeApp, registerCafe as registerCafeAt, signUp } from "./helpers/app";
import { setupTestAuth, setupTestDb } from "./helpers/testDb";

/**
 * The Customer's own Ворожка reveal (#23, redesign turn 1): a scan records a
 * fortune against the Customer, their device polls for the most recent unseen
 * one, and «Дякую» marks it seen. Verified across the HTTP seam.
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
});

function app() {
  return makeApp({ db, auth });
}

/** One scan: fetch the Customer's QR and have the CafeOwner issue against it. */
async function earn(
  cafeId: string,
  ownerCookie: string,
  customerCookie: string,
) {
  const tokenRes = await app().request("/api/qr-token", {
    headers: { cookie: customerCookie },
  });
  const { token } = (await tokenRes.json()) as { token: string };
  const res = await app().request("/api/purchases", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ cafeId, qrToken: token }),
  });
  expect(res.status).toBe(201);
}

function pending(cookie?: string) {
  return app().request("/api/me/fortune/pending", {
    headers: cookie ? { cookie } : {},
  });
}

test("a scan records a reveal the Customer can then fetch, with the scan's context", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafeAt(app(), "Кавця «Демо»", owner);
  const customer = await signUp(app(), "customer@example.com");

  await earn(cafeId, owner, customer);

  const res = await pending(customer);
  expect(res.status).toBe(200);
  const fortune = pendingFortuneResponseSchema.parse(await res.json());
  expect(fortune).not.toBeNull();
  expect(fortune!.fortune.length).toBeGreaterThan(0);
  expect(fortune!.cafeName).toBe("Кавця «Демо»");
  // One scan → one Зернятко.
  expect(fortune!.balance).toBe(1);
});

test("«Дякую» marks the reveal seen, so it is not shown again", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafeAt(app(), "Кавця", owner);
  const customer = await signUp(app(), "customer@example.com");
  await earn(cafeId, owner, customer);

  const first = pendingFortuneResponseSchema.parse(
    await (await pending(customer)).json(),
  );
  const seen = await app().request(`/api/me/fortune/${first!.id}/seen`, {
    method: "POST",
    headers: { cookie: customer },
  });
  expect(seen.status).toBe(204);

  const after = pendingFortuneResponseSchema.parse(
    await (await pending(customer)).json(),
  );
  expect(after).toBeNull();
});

test("the pending reveal is per-Customer and needs auth", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafeAt(app(), "Кавця", owner);
  const customer = await signUp(app(), "customer@example.com");
  const other = await signUp(app(), "other@example.com");
  await earn(cafeId, owner, customer);

  // Another Customer sees nothing of this reveal.
  expect(
    pendingFortuneResponseSchema.parse(await (await pending(other)).json()),
  ).toBeNull();
});
