import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import {
  rosterBoardResponseSchema,
  rosterRequestResultSchema,
} from "@kavtsya/shared";
import type { Auth } from "../src/auth";
import { fixedClock } from "../src/clock";
import type { Database } from "../src/db";
import { clearPlatformConfigCache } from "../src/platform-config";
import type { PushMessage, PushProvider } from "../src/push";
import { makeApp, registerCafe, signUp } from "./helpers/app";
import { setupTestAuth, setupTestDb } from "./helpers/testDb";

/**
 * Barista Roster + printed poster (#97, ADR 0013): a Café's persistent
 * trusted-barista list plus a non-secret wall join-code. A non-rostered poster
 * scan raises a deduped, rate-limited pending request that grants nothing and
 * pushes the owner an OPERATIONAL notification (not gated by the #24 marketing
 * consent); the owner approves or removes from the Roster board. Driven through
 * the HTTP seam like the shift suite; the rate-limit runs on the injected clock.
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
  // cascade also clears the roster, push_tokens, and purchases (they reference cafes/user).
  await db`truncate "user", "session", "account", "verification", cafes cascade`;
  await db`truncate fortunes`;
  clearPlatformConfigCache();
});

/** Mid-afternoon in Kyiv summer time — the rate-limit boundary is asserted against it. */
const SCAN_AT = new Date("2026-07-10T12:00:00Z");

/** A push provider that records every message it is asked to send. */
function recordingProvider(): { provider: PushProvider; sent: PushMessage[] } {
  const sent: PushMessage[] = [];
  return {
    sent,
    provider: {
      async send(messages) {
        sent.push(...messages);
        return messages.map((_, i) => ({ ticketId: `ticket-${i}` }));
      },
      async fetchReceipts() {
        return {};
      },
    },
  };
}

/** The poster code the owner would print — read off the Roster board. */
async function posterCodeOf(
  app: ReturnType<typeof makeApp>,
  cafeId: string,
  owner: string,
): Promise<string> {
  const res = await app.request(`/api/cafes/${cafeId}/roster`, {
    headers: { cookie: owner },
  });
  expect(res.status).toBe(200);
  return rosterBoardResponseSchema.parse(await res.json()).posterCode;
}

function scanPoster(
  app: ReturnType<typeof makeApp>,
  posterCode: string,
  cookie?: string,
) {
  return app.request("/api/roster-requests", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ posterCode }),
  });
}

function readBoard(
  app: ReturnType<typeof makeApp>,
  cafeId: string,
  cookie?: string,
) {
  return app.request(`/api/cafes/${cafeId}/roster`, {
    headers: { ...(cookie ? { cookie } : {}) },
  });
}

function approve(
  app: ReturnType<typeof makeApp>,
  cafeId: string,
  userId: string,
  cookie?: string,
) {
  return app.request(`/api/cafes/${cafeId}/roster/${userId}/approve`, {
    method: "POST",
    headers: { ...(cookie ? { cookie } : {}) },
  });
}

function remove(
  app: ReturnType<typeof makeApp>,
  cafeId: string,
  userId: string,
  cookie?: string,
) {
  return app.request(`/api/cafes/${cafeId}/roster/${userId}`, {
    method: "DELETE",
    headers: { ...(cookie ? { cookie } : {}) },
  });
}

async function userIdOf(
  app: ReturnType<typeof makeApp>,
  cookie: string,
): Promise<string> {
  const res = await app.request("/api/me", { headers: { cookie } });
  return ((await res.json()) as { id: string }).id;
}

/** Register a device token for the account WITHOUT opting into marketing (consent stays false). */
async function registerToken(
  app: ReturnType<typeof makeApp>,
  cookie: string,
  token: string,
): Promise<void> {
  const res = await app.request("/api/me/push-token", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ token, deviceId: "device-1" }),
  });
  expect(res.status).toBe(204);
}

/** Owner + Café + its poster code — the fixture most roster tests start from. */
async function rosterFixture(app: ReturnType<typeof makeApp>) {
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця «Ростер»", owner);
  const posterCode = await posterCodeOf(app, cafeId, owner);
  return { owner, cafeId, posterCode };
}

// --- the poster scan raises a request ----------------------------------------------

test("a non-rostered poster scan raises a pending request and pushes the owner", async () => {
  const { provider, sent } = recordingProvider();
  const app = makeApp({
    db,
    auth,
    clock: fixedClock(SCAN_AT),
    pushProvider: provider,
  });
  const { owner, cafeId, posterCode } = await rosterFixture(app);
  // The owner has a device but has NEVER opted into marketing — consent is off.
  await registerToken(app, owner, "ExponentPushToken[owner]");
  const barista = await signUp(app, "barista@example.com");

  const res = await scanPoster(app, posterCode, barista);

  expect(res.status).toBe(200);
  const result = rosterRequestResultSchema.parse(await res.json());
  expect(result).toEqual({ status: "pending", cafeName: "Кавця «Ростер»" });
  // The owner is notified on their device even though marketing consent is off —
  // this is an OPERATIONAL push, deliberately not gated by #24's toggle.
  expect(sent.map((m) => m.token)).toEqual(["ExponentPushToken[owner]"]);
  // The request shows on the board as pending.
  const board = rosterBoardResponseSchema.parse(
    await (await readBoard(app, cafeId, owner)).json(),
  );
  expect(board.pending.map((p) => p.userId)).toEqual([
    await userIdOf(app, barista),
  ]);
  expect(board.rostered).toEqual([]);
});

test("a repeat scan is deduped: still pending, but the owner is not pushed twice", async () => {
  const { provider, sent } = recordingProvider();
  const app = makeApp({
    db,
    auth,
    clock: fixedClock(SCAN_AT),
    pushProvider: provider,
  });
  const { owner, cafeId, posterCode } = await rosterFixture(app);
  await registerToken(app, owner, "ExponentPushToken[owner]");
  const barista = await signUp(app, "barista@example.com");

  await scanPoster(app, posterCode, barista);
  const second = await scanPoster(app, posterCode, barista);

  expect(second.status).toBe(200);
  expect(rosterRequestResultSchema.parse(await second.json()).status).toBe(
    "pending",
  );
  // One push total — the duplicate scan folded into the existing request.
  expect(sent).toHaveLength(1);
  // And exactly one pending row (deduped by unique (cafe, user)).
  const board = rosterBoardResponseSchema.parse(
    await (await readBoard(app, cafeId, owner)).json(),
  );
  expect(board.pending).toHaveLength(1);
});

test("the rate-limit lifts after the cooldown: a later re-scan notifies the owner again", async () => {
  const { provider, sent } = recordingProvider();
  const app = makeApp({
    db,
    auth,
    clock: fixedClock(SCAN_AT),
    pushProvider: provider,
  });
  const { owner, posterCode } = await rosterFixture(app);
  await registerToken(app, owner, "ExponentPushToken[owner]");
  const barista = await signUp(app, "barista@example.com");
  await scanPoster(app, posterCode, barista);
  expect(sent).toHaveLength(1);

  // Eleven minutes later — past the ten-minute request cooldown.
  const later = makeApp({
    db,
    auth,
    clock: fixedClock(new Date(SCAN_AT.getTime() + 11 * 60_000)),
    pushProvider: provider,
  });
  const res = await scanPoster(later, posterCode, barista);

  expect(res.status).toBe(200);
  // The owner may have missed the first ping; a fresh one is allowed once the
  // cooldown elapses.
  expect(sent).toHaveLength(2);
});

test("an owner with no registered device simply isn't pushed — the request still lands", async () => {
  const { provider, sent } = recordingProvider();
  const app = makeApp({
    db,
    auth,
    clock: fixedClock(SCAN_AT),
    pushProvider: provider,
  });
  const { owner, cafeId, posterCode } = await rosterFixture(app);
  const barista = await signUp(app, "barista@example.com");

  const res = await scanPoster(app, posterCode, barista);

  expect(res.status).toBe(200);
  expect(sent).toEqual([]);
  const board = rosterBoardResponseSchema.parse(
    await (await readBoard(app, cafeId, owner)).json(),
  );
  expect(board.pending).toHaveLength(1);
});

test("a scan of a code nobody printed is not found", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(SCAN_AT) });
  await rosterFixture(app);
  const barista = await signUp(app, "barista@example.com");

  const res = await scanPoster(app, "ZZZZ9999", barista);

  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "unknown_poster" });
});

test("a sloppily typed poster code still resolves (normalization, shared with #21)", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(SCAN_AT) });
  const { posterCode } = await rosterFixture(app);
  const barista = await signUp(app, "barista@example.com");
  const typed =
    `${posterCode.slice(0, 4)}-${posterCode.slice(4)}`.toLowerCase();

  const res = await scanPoster(app, typed, barista);

  expect(res.status).toBe(200);
  expect(rosterRequestResultSchema.parse(await res.json()).status).toBe(
    "pending",
  );
});

test("an already-rostered barista's scan just says rostered — no new request, no push", async () => {
  const { provider, sent } = recordingProvider();
  const app = makeApp({
    db,
    auth,
    clock: fixedClock(SCAN_AT),
    pushProvider: provider,
  });
  const { owner, cafeId, posterCode } = await rosterFixture(app);
  const barista = await signUp(app, "barista@example.com");
  const baristaId = await userIdOf(app, barista);
  await scanPoster(app, posterCode, barista);
  expect((await approve(app, cafeId, baristaId, owner)).status).toBe(204);
  sent.length = 0;

  const res = await scanPoster(app, posterCode, barista);

  expect(res.status).toBe(200);
  expect(rosterRequestResultSchema.parse(await res.json()).status).toBe(
    "rostered",
  );
  expect(sent).toEqual([]);
});

test("the owner scanning their own poster is already rostered by construction — no request", async () => {
  const { provider, sent } = recordingProvider();
  const app = makeApp({
    db,
    auth,
    clock: fixedClock(SCAN_AT),
    pushProvider: provider,
  });
  const { owner, cafeId, posterCode } = await rosterFixture(app);

  const res = await scanPoster(app, posterCode, owner);

  expect(res.status).toBe(200);
  expect(rosterRequestResultSchema.parse(await res.json()).status).toBe(
    "rostered",
  );
  expect(sent).toEqual([]);
  const board = rosterBoardResponseSchema.parse(
    await (await readBoard(app, cafeId, owner)).json(),
  );
  expect(board.pending).toEqual([]);
});

test("raising a request requires authentication — it must attach to an account", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(SCAN_AT) });
  const { posterCode } = await rosterFixture(app);

  const res = await scanPoster(app, posterCode);

  expect(res.status).toBe(401);
});

// --- the Roster board: approve + remove --------------------------------------------

test("the demoable loop: scan → owner approves → barista shows rostered", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(SCAN_AT) });
  const { owner, cafeId, posterCode } = await rosterFixture(app);
  const barista = await signUp(app, "barista@example.com");
  const baristaId = await userIdOf(app, barista);
  await scanPoster(app, posterCode, barista);

  const approveRes = await approve(app, cafeId, baristaId, owner);
  expect(approveRes.status).toBe(204);

  const board = rosterBoardResponseSchema.parse(
    await (await readBoard(app, cafeId, owner)).json(),
  );
  expect(board.pending).toEqual([]);
  expect(board.rostered.map((r) => r.userId)).toEqual([baristaId]);
  expect(board.rostered[0]?.name).toBe("Test");
});

test("removing a barista drops them back to none", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(SCAN_AT) });
  const { owner, cafeId, posterCode } = await rosterFixture(app);
  const barista = await signUp(app, "barista@example.com");
  const baristaId = await userIdOf(app, barista);
  await scanPoster(app, posterCode, barista);
  await approve(app, cafeId, baristaId, owner);

  const removeRes = await remove(app, cafeId, baristaId, owner);
  expect(removeRes.status).toBe(204);

  const board = rosterBoardResponseSchema.parse(
    await (await readBoard(app, cafeId, owner)).json(),
  );
  expect(board.rostered).toEqual([]);
  expect(board.pending).toEqual([]);
});

test("removing a pending request declines it — nothing left on the board", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(SCAN_AT) });
  const { owner, cafeId, posterCode } = await rosterFixture(app);
  const barista = await signUp(app, "barista@example.com");
  const baristaId = await userIdOf(app, barista);
  await scanPoster(app, posterCode, barista);

  expect((await remove(app, cafeId, baristaId, owner)).status).toBe(204);

  const board = rosterBoardResponseSchema.parse(
    await (await readBoard(app, cafeId, owner)).json(),
  );
  expect(board.pending).toEqual([]);
});

test("approving an account that never requested is not found — no phantom rostering", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(SCAN_AT) });
  const { owner, cafeId } = await rosterFixture(app);
  const stranger = await signUp(app, "stranger@example.com");
  const strangerId = await userIdOf(app, stranger);

  const res = await approve(app, cafeId, strangerId, owner);

  expect(res.status).toBe(404);
});

test("another café's owner can neither read the board nor approve/remove a barista", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(SCAN_AT) });
  const { cafeId, posterCode } = await rosterFixture(app);
  const barista = await signUp(app, "barista@example.com");
  const baristaId = await userIdOf(app, barista);
  await scanPoster(app, posterCode, barista);
  const rival = await signUp(app, "rival@example.com");
  await registerCafe(app, "Кавця конкурента", rival);

  expect((await readBoard(app, cafeId, rival)).status).toBe(404);
  expect((await approve(app, cafeId, baristaId, rival)).status).toBe(404);
  expect((await remove(app, cafeId, baristaId, rival)).status).toBe(404);
});

test("the board requires authentication, and an unknown Café is not found", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(SCAN_AT) });
  const { owner, cafeId } = await rosterFixture(app);

  expect((await readBoard(app, cafeId)).status).toBe(401);
  expect(
    (await readBoard(app, "00000000-0000-0000-0000-000000000000", owner))
      .status,
  ).toBe(404);
});
