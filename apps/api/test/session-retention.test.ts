import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { Auth } from "../src/auth";
import { fixedClock } from "../src/clock";
import type { Database } from "../src/db";
import {
  pruneExpiredSessions,
  SESSION_RETENTION_DAYS,
} from "../src/session-retention";
import { cookieFrom, makeApp, registerCafe, signUp } from "./helpers/app";
import { setupTestAuth, setupTestDb } from "./helpers/testDb";

/**
 * Session retention (#254, ADR 0018): an expired session's IP address and user
 * agent are kept for a short forensics window, then the row is deleted. The
 * boundary is asserted on real Better Auth sessions — minted through the HTTP
 * seam, then aged by moving their `expiresAt` — so the sweep is proven against
 * the rows Better Auth actually writes, not hand-built look-alikes.
 */

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

const EMAIL = "anna@example.com";
const MINUTE_MS = 60_000;
const WINDOW_MS = SESSION_RETENTION_DAYS * 24 * 60 * MINUTE_MS;

function app() {
  return makeApp({ db, auth });
}

async function signIn(): Promise<string> {
  const res = await app().request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: "hunter2-very-secret" }),
  });
  expect(res.status).toBe(200);
  return cookieFrom(res);
}

/** The most recently created session — each sign-in adds one. */
async function newestSessionId(): Promise<string> {
  const [row] = await db<{ id: string }[]>`
    select "id" from "session" order by "createdAt" desc, "id" limit 1
  `;
  return row!.id;
}

async function expireAt(sessionId: string, at: Date): Promise<void> {
  await db`update "session" set "expiresAt" = ${at} where "id" = ${sessionId}`;
}

/** A minute either side of the retention cutoff, as seen from `now`. */
function justInsideWindow(now: Date): Date {
  return new Date(now.getTime() - WINDOW_MS + MINUTE_MS);
}

function justOutsideWindow(now: Date): Date {
  return new Date(now.getTime() - WINDOW_MS - MINUTE_MS);
}

async function sessionIds(): Promise<string[]> {
  const rows = await db<{ id: string }[]>`select "id" from "session"`;
  return rows.map((r) => r.id);
}

test("a session just inside the retention window survives; one just outside is deleted", async () => {
  const now = new Date();
  const live = await signUp(app(), EMAIL);
  const liveId = await newestSessionId();
  await signIn();
  const insideId = await newestSessionId();
  await signIn();
  const outsideId = await newestSessionId();
  await expireAt(insideId, justInsideWindow(now));
  await expireAt(outsideId, justOutsideWindow(now));

  expect(await pruneExpiredSessions(db, fixedClock(now))).toEqual({
    deleted: 1,
  });

  expect((await sessionIds()).sort()).toEqual([liveId, insideId].sort());
  // The live session is untouched and still authenticates.
  const me = await app().request("/api/me", { headers: { cookie: live } });
  expect(me.status).toBe(200);
});

test("re-running the sweep is a no-op — safe for a cron retry", async () => {
  const now = new Date();
  await signUp(app(), EMAIL);
  await expireAt(await newestSessionId(), justOutsideWindow(now));

  expect(await pruneExpiredSessions(db, fixedClock(now))).toEqual({
    deleted: 1,
  });
  expect(await pruneExpiredSessions(db, fixedClock(now))).toEqual({
    deleted: 0,
  });
});

test("pruning a Customer's old sessions leaves the account and its ledger intact", async () => {
  const now = new Date();
  const cookie = await signUp(app(), EMAIL);
  const sessionId = await newestSessionId();
  const cafeId = await registerCafe(app(), "Кавця", cookie);
  const [user] = await db<{ id: string }[]>`
    select "id" from "user" where "email" = ${EMAIL}
  `;
  await db`
    insert into cafe_memberships ("cafe_id", "customer_user_id")
    values (${cafeId}, ${user!.id})
  `;
  await db`
    insert into purchases ("cafe_id", "customer_user_id", "qr_jti", "entry_source")
    values (${cafeId}, ${user!.id}, ${crypto.randomUUID()}, 'qr')
  `;
  await expireAt(sessionId, justOutsideWindow(now));

  expect(await pruneExpiredSessions(db, fixedClock(now))).toEqual({
    deleted: 1,
  });

  const [counts] = await db<{ users: number; purchases: number }[]>`
    select
      (select count(*)::int from "user" where "id" = ${user!.id}) as users,
      (select count(*)::int from purchases where "customer_user_id" = ${user!.id}) as purchases
  `;
  expect(counts).toEqual({ users: 1, purchases: 1 });
  // The Customer simply signs in again — nothing about the account was lost.
  await signIn();
});
