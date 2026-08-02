import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { setupTestAuth, setupTestDb } from "./helpers/testDb";
import { makeApp, signUp } from "./helpers/app";
import type { Auth } from "../src/auth";
import type { Database } from "../src/db";

/**
 * The protected-route guard (#51). Authentication is enforced once, at the app
 * seam, so this is the one suite that asserts the 401 — the route suites are
 * free to assume a session and test their own behaviour.
 *
 * The table is the point: it names the whole protected surface in one place, so
 * a route added without a session requirement shows up here as a missing row
 * rather than as a silent hole in a handler nobody re-read.
 */

let db: Database;
let auth: Auth;
let pool: Awaited<ReturnType<typeof setupTestAuth>>["pool"];

beforeAll(async () => {
  db = await setupTestDb();
  ({ auth, pool } = setupTestAuth());
});

afterAll(async () => {
  await db.end();
  await pool.end();
});

beforeEach(async () => {
  // cascade also clears cafes (FK to "user"); listed for intent.
  await db`truncate "user", "session", "account", "verification", cafes cascade`;
});

function app() {
  return makeApp({ db, auth });
}

/**
 * Every route behind the guard. A uuid stands in for path params: the guard
 * runs before any handler, so the ids never have to exist — an anonymous
 * request must never get far enough to look them up.
 */
const ID = "00000000-0000-0000-0000-000000000000";
const protectedRoutes: [method: string, path: string][] = [
  ["GET", "/api/me"],
  ["GET", "/api/me/deletion-preview"],
  ["DELETE", "/api/me"],
  ["GET", "/api/me/member-code"],
  ["GET", "/api/me/balances"],
  ["GET", "/api/me/fortune/pending"],
  ["POST", `/api/me/fortune/${ID}/seen`],
  ["GET", "/api/me/shift"],
  ["DELETE", "/api/me/shift"],
  ["PUT", "/api/me/push-consent"],
  ["POST", "/api/me/push-token"],
  ["GET", "/api/qr-token"],
  ["GET", "/api/reward-defaults"],
  ["POST", "/api/cafes"],
  ["GET", `/api/cafes/${ID}/program`],
  ["PUT", `/api/cafes/${ID}/program`],
  ["GET", `/api/cafes/${ID}/shifts`],
  ["DELETE", `/api/cafes/${ID}/shifts/${ID}`],
  ["GET", `/api/cafes/${ID}/roster`],
  ["POST", `/api/cafes/${ID}/roster/${ID}/approve`],
  ["DELETE", `/api/cafes/${ID}/roster/${ID}`],
  ["POST", `/api/cafes/${ID}/campaigns`],
  ["GET", `/api/cafes/${ID}/analytics`],
  ["POST", "/api/purchases"],
  ["POST", "/api/redemptions"],
  ["POST", "/api/poster-scans"],
];

test.each(protectedRoutes)("%s %s requires a session", async (method, path) => {
  const res = await app().request(path, {
    method,
    headers: { "content-type": "application/json" },
    // A body on every route, so a 400 from body parsing can never be what we
    // are reading as the guard: the guard must answer before parsing.
    body: method === "GET" || method === "DELETE" ? undefined : "{}",
  });

  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "unauthorized" });
});

test("the guard answers before a handler parses anything", async () => {
  // A body that every writing route would reject as invalid: still 401, never
  // 400 — nothing downstream of the guard runs for an anonymous caller.
  const res = await app().request("/api/cafes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not json at all",
  });

  expect(res.status).toBe(401);
});

test("default-deny: an unmatched path under the guard is 401, not 404", async () => {
  // The guard sits at `*`, ahead of routing, so an anonymous caller cannot
  // learn which paths exist. This is the property that makes a *future* route
  // protected by the time it is written.
  const anonymous = await app().request("/api/not-a-route");
  expect(anonymous.status).toBe(401);

  const cookie = await signUp(app(), "probe@example.com");
  const authed = await app().request("/api/not-a-route", {
    headers: { cookie },
  });
  expect(authed.status).toBe(404);
});

// --- the public surface stays public -------------------------------------------------

test("health needs no session", async () => {
  const res = await app().request("/health");

  expect(res.status).toBe(200);
});

test("Better Auth's own routes need no session", async () => {
  // Signing up is the bootstrap: if the guard covered /api/auth/*, no account
  // could ever be created.
  const res = await app().request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "public-surface@example.com",
      password: "hunter2-very-secret",
      name: "Test",
    }),
  });

  expect(res.status).toBe(200);
});
