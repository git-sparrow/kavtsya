import { afterAll, beforeAll, expect, test } from "vitest";
import { healthResponseSchema } from "@kavtsya/shared";
import { createApp } from "../src/app";
import { fixedClock } from "../src/clock";
import type { Database } from "../src/db";
import { setupTestDb } from "./helpers/testDb";

let db: Database;

beforeAll(async () => {
  db = await setupTestDb();
});

afterAll(async () => {
  await db?.end();
});

test("GET /health reports ok and a live DB connection", async () => {
  // Frozen clock proves the response time comes from the injected clock,
  // not a real wall-clock read.
  const clock = fixedClock(new Date("2026-06-18T09:00:00.000Z"));
  const app = createApp({ db, clock });

  const res = await app.request("/health");

  expect(res.status).toBe(200);
  const body = healthResponseSchema.parse(await res.json());
  expect(body).toEqual({
    status: "ok",
    db: "ok",
    time: "2026-06-18T09:00:00.000Z",
  });
});
