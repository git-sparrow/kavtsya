import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
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
  // Better Auth asserted *through* the HTTP seam (PRD). Start each test from a
  // clean account state so a fixed email never collides across runs.
  await db`truncate "user", "session", "account", "verification" cascade`;
});

function app() {
  return createApp({ db, clock: systemClock, auth });
}

function postJson(path: string, body: unknown, cookie?: string) {
  return app().request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

/** Fold a response's Set-Cookie headers into a Cookie request header value. */
function cookieFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

const CUSTOMER = {
  email: "customer@example.com",
  password: "hunter2-very-secret",
  name: "Test Customer",
};

test("Customer can sign up with email/password and is persisted", async () => {
  const res = await postJson("/api/auth/sign-up/email", CUSTOMER);

  expect(res.status).toBe(200);

  const rows = await db<{ email: string }[]>`
    select email from "user" where email = ${CUSTOMER.email}
  `;
  expect(rows).toHaveLength(1);
});

test("sign-up issues a session usable on an authenticated route", async () => {
  const signup = await postJson("/api/auth/sign-up/email", CUSTOMER);
  const cookie = cookieFrom(signup);
  expect(cookie).not.toBe("");

  const me = await app().request("/api/me", { headers: { cookie } });

  expect(me.status).toBe(200);
  expect(await me.json()).toMatchObject({
    email: CUSTOMER.email,
    name: CUSTOMER.name,
  });
});

test("Customer can log in and the session authenticates /api/me", async () => {
  await postJson("/api/auth/sign-up/email", CUSTOMER);

  const login = await postJson("/api/auth/sign-in/email", {
    email: CUSTOMER.email,
    password: CUSTOMER.password,
  });
  expect(login.status).toBe(200);

  const me = await app().request("/api/me", {
    headers: { cookie: cookieFrom(login) },
  });
  expect(me.status).toBe(200);
  expect(await me.json()).toMatchObject({ email: CUSTOMER.email });
});

test("/api/me rejects an unauthenticated request", async () => {
  const me = await app().request("/api/me");

  expect(me.status).toBe(401);
  expect(await me.json()).toEqual({ error: "unauthorized" });
});

test("login with a wrong password is rejected", async () => {
  await postJson("/api/auth/sign-up/email", CUSTOMER);

  const login = await postJson("/api/auth/sign-in/email", {
    email: CUSTOMER.email,
    password: "wrong-password-entirely",
  });

  expect(login.status).toBe(401);
});
