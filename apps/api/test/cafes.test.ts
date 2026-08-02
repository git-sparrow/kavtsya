import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { cafeSchema, meResponseSchema } from "@kavtsya/shared";
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
  // cascade also clears cafes (FK to "user"); listed for intent.
  await db`truncate "user", "session", "account", "verification", cafes cascade`;
});

function app() {
  return makeApp({ db, auth });
}

function registerCafe(name: string, cookie?: string) {
  return app().request("/api/cafes", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ name }),
  });
}

test("a signed-in Customer can register a Café, persisted under their ownership", async () => {
  const cookie = await signUp(app(), "owner@example.com");

  const res = await registerCafe("Кавця на Хрещатику", cookie);

  expect(res.status).toBe(201);
  const cafe = cafeSchema.parse(await res.json());
  expect(cafe.name).toBe("Кавця на Хрещатику");

  const rows = await db<{ name: string; owner_user_id: string }[]>`
    select c.name, c.owner_user_id, u.email
    from cafes c join "user" u on u.id = c.owner_user_id
    where c.id = ${cafe.id}
  `;
  expect(rows).toHaveLength(1);
  expect(rows[0]?.name).toBe("Кавця на Хрещатику");
});

test("an account with no Café is a customer only", async () => {
  const cookie = await signUp(app(), "plain@example.com");

  const res = await app().request("/api/me", { headers: { cookie } });

  expect(res.status).toBe(200);
  const me = meResponseSchema.parse(await res.json());
  expect(me.roles).toEqual(["customer"]);
  expect(me.cafes).toEqual([]);
});

test("registering a Café unlocks the cafe_owner role on the same account", async () => {
  const cookie = await signUp(app(), "owner@example.com");
  const created = await registerCafe("Кавця на Подолі", cookie);
  const cafe = cafeSchema.parse(await created.json());

  const res = await app().request("/api/me", { headers: { cookie } });
  const me = meResponseSchema.parse(await res.json());

  // One account, both roles (ADR 0003).
  expect(me.roles).toContain("customer");
  expect(me.roles).toContain("cafe_owner");
  // Every Café is born Free (#24, ADR 0011) — the Plan rides on the same read.
  // A brand-new Café has no returning Customers yet, so the free teaser (#25,
  // ADR 0011) that also rides on this read starts at zero.
  expect(me.cafes).toEqual([
    {
      id: cafe.id,
      name: "Кавця на Подолі",
      plan: "free",
      returningCustomers30d: 0,
    },
  ]);
});

test("an empty Café name is rejected", async () => {
  const cookie = await signUp(app(), "owner@example.com");

  const res = await registerCafe("   ", cookie);

  expect(res.status).toBe(400);
});

test("ownership is isolated: each owner sees only their own Café", async () => {
  const alice = await signUp(app(), "alice@example.com");
  const bob = await signUp(app(), "bob@example.com");
  await registerCafe("Alice Café", alice);
  await registerCafe("Bob Café", bob);

  const aliceMe = meResponseSchema.parse(
    await (
      await app().request("/api/me", { headers: { cookie: alice } })
    ).json(),
  );

  expect(aliceMe.cafes.map((c) => c.name)).toEqual(["Alice Café"]);
});
