import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { cafeSchema, meResponseSchema } from "@kavtsya/shared";
import { createApp } from "../src/app";
import type { Auth } from "../src/auth";
import { systemClock } from "../src/clock";
import type { Database } from "../src/db";
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
  return createApp({
    db,
    clock: systemClock,
    auth,
    qrTokenSecret: "test-qr-token-secret-at-least-32-chars",
  });
}

/** Fold a response's Set-Cookie headers into a Cookie request header value. */
function cookieFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

/** Sign a fresh Customer up and return their session cookie. */
async function signUp(email: string): Promise<string> {
  const res = await app().request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "hunter2-very-secret",
      name: "Test",
    }),
  });
  expect(res.status).toBe(200);
  return cookieFrom(res);
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

test("registering a Café requires authentication", async () => {
  const res = await registerCafe("Кавця на Хрещатику");

  expect(res.status).toBe(401);
});

test("a signed-in Customer can register a Café, persisted under their ownership", async () => {
  const cookie = await signUp("owner@example.com");

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
  const cookie = await signUp("plain@example.com");

  const res = await app().request("/api/me", { headers: { cookie } });

  expect(res.status).toBe(200);
  const me = meResponseSchema.parse(await res.json());
  expect(me.roles).toEqual(["customer"]);
  expect(me.cafes).toEqual([]);
});

test("registering a Café unlocks the cafe_owner role on the same account", async () => {
  const cookie = await signUp("owner@example.com");
  const created = await registerCafe("Кавця на Подолі", cookie);
  const cafe = cafeSchema.parse(await created.json());

  const res = await app().request("/api/me", { headers: { cookie } });
  const me = meResponseSchema.parse(await res.json());

  // One account, both roles (ADR 0003).
  expect(me.roles).toContain("customer");
  expect(me.roles).toContain("cafe_owner");
  expect(me.cafes).toEqual([{ id: cafe.id, name: "Кавця на Подолі" }]);
});

test("an empty Café name is rejected", async () => {
  const cookie = await signUp("owner@example.com");

  const res = await registerCafe("   ", cookie);

  expect(res.status).toBe(400);
});

test("ownership is isolated: each owner sees only their own Café", async () => {
  const alice = await signUp("alice@example.com");
  const bob = await signUp("bob@example.com");
  await registerCafe("Alice Café", alice);
  await registerCafe("Bob Café", bob);

  const aliceMe = meResponseSchema.parse(
    await (
      await app().request("/api/me", { headers: { cookie: alice } })
    ).json(),
  );

  expect(aliceMe.cafes.map((c) => c.name)).toEqual(["Alice Café"]);
});
