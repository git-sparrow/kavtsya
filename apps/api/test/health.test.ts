import type { Pool } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";
import { healthResponseSchema } from "@kavtsya/shared";
import type { Auth } from "../src/auth";
import { fixedClock } from "../src/clock";
import type { Database } from "../src/db";
import { makeApp } from "./helpers/app";
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

test("GET /health reports ok and a live DB connection", async () => {
  // Frozen clock proves the response time comes from the injected clock,
  // not a real wall-clock read.
  const clock = fixedClock(new Date("2026-06-18T09:00:00.000Z"));
  const app = makeApp({ db, auth, clock });

  const res = await app.request("/health");

  expect(res.status).toBe(200);
  const body = healthResponseSchema.parse(await res.json());
  expect(body).toEqual({
    status: "ok",
    db: "ok",
    time: "2026-06-18T09:00:00.000Z",
  });
});
