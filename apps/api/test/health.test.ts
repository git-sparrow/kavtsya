import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { healthResponseSchema } from "@kavtsya/shared";
import type { Auth } from "../src/auth";
import { fixedClock } from "../src/clock";
import type { Database } from "../src/db";
import { generateDailyFortunes } from "../src/fortunes";
import { makeApp } from "./helpers/app";
import { setupTestAuth, setupTestDb } from "./helpers/testDb";

let db: Database;
let auth: Auth;
let pool: Pool;

// 2026-06-18T09:00Z is 12:00 in Kyiv (UTC+3, summer) — mid-day, no midnight
// edge, so the response's Kyiv day is unambiguously the 18th.
const CLOCK = fixedClock(new Date("2026-06-18T09:00:00.000Z"));

beforeAll(async () => {
  db = await setupTestDb();
  ({ auth, pool } = setupTestAuth());
});

afterAll(async () => {
  await pool?.end();
  await db?.end();
});

beforeEach(async () => {
  await db`truncate fortunes`;
});

test("GET /health reports ok and a live DB connection", async () => {
  // Frozen clock proves the response time comes from the injected clock,
  // not a real wall-clock read.
  const app = makeApp({ db, auth, clock: CLOCK });

  const res = await app.request("/health");

  expect(res.status).toBe(200);
  const body = healthResponseSchema.parse(await res.json());
  expect(body).toEqual({
    status: "ok",
    db: "ok",
    time: "2026-06-18T09:00:00.000Z",
    // Empty pool still reports a count (0), keyed to today's Kyiv day — a
    // failed generation job is visible, not masked by the silent fallback.
    fortunePool: { day: "2026-06-18", count: 0 },
  });
});

test("GET /health surfaces today's fortune-pool count", async () => {
  await generateDailyFortunes(db, {
    provider: {
      generateFortunes: async () => ["Кава на щастя.", "Дорога чекає."],
    },
    clock: CLOCK,
  });
  const app = makeApp({ db, auth, clock: CLOCK });

  const res = await app.request("/health");

  expect(res.status).toBe(200);
  const body = healthResponseSchema.parse(await res.json());
  expect(body.fortunePool).toEqual({ day: "2026-06-18", count: 2 });
});

test.each(["/health", "/api/me", "/api/auth/ok"])(
  "%s declares security headers on public, rejected and auth responses",
  async (path) => {
    const app = makeApp({ db, auth });
    const response = await app.request(path);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("strict-transport-security")).toBe(
      "max-age=15552000; includeSubDomains",
    );
  },
);
