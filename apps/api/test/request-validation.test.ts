import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { makeApp, registerCafe, signUp } from "./helpers/app";
import { setupTestAuth, setupTestDb } from "./helpers/testDb";
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
  "%s %s rejects NUL before database use",
  async (method, path, body) => {
    const app = makeApp({ db, auth });
    const cookie = await signUp(app, "owner@example.com");
    const cafeId = await registerCafe(app, "Кавця", cookie);
    const snapshot = async () => {
      const tables = await db<
        { tablename: string }[]
      >`select tablename from pg_tables where schemaname='public' order by tablename`;
      return Promise.all(
        tables.map(async ({ tablename }) =>
          db.unsafe(
            `select row_to_json(t)::text as row from "${tablename}" t order by row_to_json(t)::text`,
          ),
        ),
      );
    };
    const before = await snapshot();
    const res = await app.request(path.replace(":cafe", cafeId), {
      method,
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ cafeId, ...body }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
    expect(await snapshot()).toEqual(before);
  },
);

test("public signup rejects NUL without creating an account", async () => {
  const app = makeApp({ db, auth });
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
  expect((await db`select count(*)::int as n from "user"`)[0]?.n).toBe(0);
});
