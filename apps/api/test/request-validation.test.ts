import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { makeApp, registerCafe, signUp } from "./helpers/app";
import {
  snapshotPublicTables,
  setupTestAuth,
  setupTestDb,
} from "./helpers/testDb";
import type { Database } from "../src/db";

let db: Database;
let auth: ReturnType<typeof setupTestAuth>["auth"];
let pool: ReturnType<typeof setupTestAuth>["pool"];
beforeAll(async () => {
  db = await setupTestDb();
  ({ auth, pool } = setupTestAuth());
});
afterAll(async () => {
  await pool.end();
  await db.end();
});
beforeEach(async () => {
  await db`truncate "user", "session", "account", "verification", cafes cascade`;
});

const cases = [
  ["POST", "/api/me/push-token", { token: "\u0000", deviceId: "device" }],
  ["POST", "/api/me/push-token", { token: "token", deviceId: "\u0000" }],
  ["POST", "/api/poster-scans", { posterCode: "\u0000" }],
  ["POST", "/api/purchases", { memberCode: "\u0000" }],
  ["POST", "/api/redemptions", { customerId: "\u0000", idempotencyKey: "key" }],
  [
    "POST",
    "/api/redemptions",
    { customerId: "customer", idempotencyKey: "\u0000" },
  ],
  ["POST", "/api/cafes", { name: "\u0000" }],
  ["POST", "/api/cafes/:cafe/campaigns", { message: "\u0000" }],
  ["POST", "/api/cafes/:cafe/roster/%00/approve", {}],
  ["POST", "/api/auth/update-user", { name: "\u0000" }],
  [
    "POST",
    "/api/me/push-token",
    { token: "valid", deviceId: "valid", nested: { value: ["\u0000"] } },
  ],
  [
    "POST",
    "/api/me/push-token",
    { token: "valid", deviceId: "valid", "\u0000": "value" },
  ],
] as const;

test.each(cases)(
  "%# %s %s rejects NUL before database use",
  async (method, path, body) => {
    const app = makeApp({ db, auth });
    const cookie = await signUp(app, "owner@example.com");
    const cafeId = await registerCafe(app, "Кавця", cookie);
    const before = await snapshotPublicTables(db);
    const res = await app.request(path.replace(":cafe", cafeId), {
      method,
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ cafeId, ...body }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
    expect(await snapshotPublicTables(db)).toEqual(before);
  },
);

test("public signup rejects NUL without creating an account", async () => {
  const app = makeApp({ db, auth });
  const before = await snapshotPublicTables(db);
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "nul@example.com",
      name: "\u0000",
      password: "hunter2-very-secret",
    }),
  });
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: "invalid_request" });
  expect(await snapshotPublicTables(db)).toEqual(before);
});

test.each([
  ["value", [["name", "\u0000"]]],
  [
    "field name",
    [
      ["name", "Valid"],
      ["\u0000", "value"],
    ],
  ],
  [
    "repeated field",
    [
      ["name", "\u0000"],
      ["name", "Valid"],
    ],
  ],
] as const)(
  "form signup rejects NUL in %s before persistence without logging an error",
  async (_case, fields) => {
    const app = makeApp({ db, auth });
    const before = await snapshotPublicTables(db);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await app.request("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams([
          ["email", "form@example.com"],
          ["password", "hunter2-very-secret"],
          ...fields.map(([key, value]) => [key, value]),
        ]).toString(),
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_request" });
      expect(await snapshotPublicTables(db)).toEqual(before);
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  },
);

test("form signup and signin preserve the auth request body", async () => {
  const app = makeApp({ db, auth });
  const headers = {
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
  };
  const credentials = {
    email: "form@example.com",
    password: "hunter2-very-secret",
  };
  const signup = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers,
    body: new URLSearchParams({
      ...credentials,
      name: "Form Customer",
    }).toString(),
  });
  expect(signup.status).toBe(200);
  const signin = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers,
    body: new URLSearchParams(credentials).toString(),
  });
  expect(signin.status).toBe(200);
  const cookie = signin.headers.get("set-cookie")?.split(";")[0];
  expect(cookie).toBeTruthy();
  const me = await app.request("/api/me", { headers: { cookie: cookie! } });
  expect(me.status).toBe(200);
  expect(await me.json()).toMatchObject({
    email: credentials.email,
    name: "Form Customer",
  });
});

test("public requests reject oversized bodies before parsing", async () => {
  const app = makeApp({ db, auth });
  for (const path of ["/health", "/api/auth/sign-up/email"]) {
    const res = await app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x".repeat(128 * 1024) }),
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "invalid_request" });
  }
});

test("query NUL is rejected and anonymous NUL keeps the authentication response", async () => {
  const app = makeApp({ db, auth });
  const cookie = await signUp(app, "customer@example.com");
  const before = await snapshotPublicTables(db);
  const query = await app.request("/api/me?x=%00", { headers: { cookie } });
  expect(query.status).toBe(400);
  expect(await query.json()).toEqual({ error: "invalid_request" });
  const anonymous = await app.request("/api/me?x=%00");
  expect(anonymous.status).toBe(401);
  expect(await snapshotPublicTables(db)).toEqual(before);
});

test("malformed JSON keeps the route's error contract", async () => {
  const app = makeApp({ db, auth });
  const cookie = await signUp(app, "customer@example.com");
  const before = await snapshotPublicTables(db);
  const res = await app.request("/api/purchases", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: "{",
  });
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: "invalid_purchase" });
  expect(await snapshotPublicTables(db)).toEqual(before);
});
