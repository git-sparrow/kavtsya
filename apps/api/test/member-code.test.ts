import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { memberCodeResponseSchema } from "@kavtsya/shared";
import type { Auth } from "../src/auth";
import type { Database } from "../src/db";
import { makeApp, signUp } from "./helpers/app";
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
  await db`truncate "user", "session", "account", "verification", cafes cascade`;
});

function app() {
  return makeApp({ db, auth });
}

async function memberCodeFor(cookie: string): Promise<string> {
  const res = await app().request("/api/me/member-code", {
    headers: { cookie },
  });
  expect(res.status).toBe(200);
  return memberCodeResponseSchema.parse(await res.json()).memberCode;
}

// --- the Customer's stable member code (#21, ADR 0006) --------------------------

test("a Customer's member code is 8 Crockford characters, minted once, stable across calls", async () => {
  const customer = await signUp(app(), "customer@example.com");

  const code = await memberCodeFor(customer);

  // Crockford base32: no I, L, O, U — the Customer reads it aloud, the
  // CafeOwner types it; look-alikes are designed out (#21).
  expect(code).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
  // The code is the Customer's durable offline identity: every later read —
  // fresh session, reinstalled app — must hand back the same code.
  expect(await memberCodeFor(customer)).toBe(code);
});

test("two Customers get distinct member codes", async () => {
  const one = await signUp(app(), "one@example.com");
  const two = await signUp(app(), "two@example.com");

  expect(await memberCodeFor(one)).not.toBe(await memberCodeFor(two));
});

test("reading the member code requires authentication", async () => {
  const res = await app().request("/api/me/member-code");

  expect(res.status).toBe(401);
});
