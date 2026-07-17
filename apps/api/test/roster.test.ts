import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import {
  posterScanResultSchema,
  rosterBoardResponseSchema,
} from "@kavtsya/shared";
import type { Auth } from "../src/auth";
import { fixedClock } from "../src/clock";
import type { Database } from "../src/db";
import { clearPlatformConfigCache } from "../src/platform-config";
import type { PushMessage, PushProvider } from "../src/push";
import { makeApp, registerCafe, signUp } from "./helpers/app";
import { setupTestAuth, setupTestDb } from "./helpers/testDb";

/**
 * Barista Roster + poster-started Shifts (#97/#98/#99, ADR 0013). One poster
 * scan (`POST /api/poster-scans`) does one of three things by roster state: a
 * non-rostered account raises a deduped, rate-limited pending request (and the
 * owner gets an OPERATIONAL push, not gated by #24 consent); a rostered account
 * (or the owner) starts a Shift; a rostered account already on shift elsewhere
 * is asked to switch. Removing a barista instantly ends their shift. Driven
 * through the HTTP seam; the rate-limit and expiries run on the injected clock.
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
  // cascade also clears the roster, grants, push_tokens, and purchases.
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
  confirmSwitch?: boolean,
) {
  return app.request("/api/poster-scans", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({
      posterCode,
      ...(confirmSwitch ? { confirmSwitch } : {}),
    }),
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

/** Put a barista on the roster: scan → owner approves. Returns their cookie + id. */
async function rosterBarista(
  app: ReturnType<typeof makeApp>,
  cafeId: string,
  posterCode: string,
  owner: string,
  email = "barista@example.com",
) {
  const barista = await signUp(app, email);
  const baristaId = await userIdOf(app, barista);
  await scanPoster(app, posterCode, barista);
  expect((await approve(app, cafeId, baristaId, owner)).status).toBe(204);
  return { barista, baristaId };
}

// --- a non-rostered scan raises a request ------------------------------------------

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
  const result = posterScanResultSchema.parse(await res.json());
  expect(result).toEqual({ status: "pending", cafeName: "Кавця «Ростер»" });
  // The owner is notified even though marketing consent is off — an OPERATIONAL
  // push, deliberately not gated by #24's toggle.
  expect(sent.map((m) => m.token)).toEqual(["ExponentPushToken[owner]"]);
  const board = rosterBoardResponseSchema.parse(
    await (await readBoard(app, cafeId, owner)).json(),
  );
  expect(board.pending.map((p) => p.userId)).toEqual([
    await userIdOf(app, barista),
  ]);
  expect(board.rostered).toEqual([]);
});

test("a non-rostered scan starts no Shift — the barista is not on duty", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(SCAN_AT) });
  const { posterCode } = await rosterFixture(app);
  const barista = await signUp(app, "barista@example.com");

  const res = await scanPoster(app, posterCode, barista);
  expect(posterScanResultSchema.parse(await res.json()).status).toBe("pending");

  // No grant means `/api/me/shift` is null — the app stays in Customer Mode.
  const shift = await app.request("/api/me/shift", {
    headers: { cookie: barista },
  });
  expect((await shift.json()) as unknown).toEqual({ shift: null });
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
  expect(posterScanResultSchema.parse(await second.json()).status).toBe(
    "pending",
  );
  expect(sent).toHaveLength(1);
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
  expect(posterScanResultSchema.parse(await res.json()).status).toBe("pending");
});

test("raising a request requires authentication — it must attach to an account", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(SCAN_AT) });
  const { posterCode } = await rosterFixture(app);

  const res = await scanPoster(app, posterCode);

  expect(res.status).toBe(401);
});

// --- a rostered scan starts a Shift (#98) ------------------------------------------

test("a rostered barista scanning the poster starts a Shift → Scanner Mode", async () => {
  const { provider, sent } = recordingProvider();
  const app = makeApp({
    db,
    auth,
    clock: fixedClock(SCAN_AT),
    pushProvider: provider,
  });
  const { owner, cafeId, posterCode } = await rosterFixture(app);
  const { barista } = await rosterBarista(app, cafeId, posterCode, owner);
  sent.length = 0;

  const res = await scanPoster(app, posterCode, barista);

  expect(res.status).toBe(201);
  const result = posterScanResultSchema.parse(await res.json());
  expect(result).toEqual({
    status: "shift_started",
    shift: {
      cafeId,
      cafeName: "Кавця «Ростер»",
      // The rolling ~16h cap (#99): 12:00Z + 16h.
      expiresAt: "2026-07-11T04:00:00.000Z",
    },
  });
  // Starting a shift is not a request — the owner is not pushed.
  expect(sent).toEqual([]);
  // The owner's board now lists them on shift.
  const shifts = (await (
    await app.request(`/api/cafes/${cafeId}/shifts`, {
      headers: { cookie: owner },
    })
  ).json()) as { baristaName: string }[];
  expect(shifts).toHaveLength(1);
});

test("re-scanning the same poster mid-shift is idempotent — one grant, not two", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(SCAN_AT) });
  const { owner, cafeId, posterCode } = await rosterFixture(app);
  const { barista } = await rosterBarista(app, cafeId, posterCode, owner);

  const first = posterScanResultSchema.parse(
    await (await scanPoster(app, posterCode, barista)).json(),
  );
  const second = posterScanResultSchema.parse(
    await (await scanPoster(app, posterCode, barista)).json(),
  );

  expect(first).toEqual(second);
  const shifts = (await (
    await app.request(`/api/cafes/${cafeId}/shifts`, {
      headers: { cookie: owner },
    })
  ).json()) as unknown[];
  expect(shifts).toHaveLength(1);
});

test("the owner scanning their own poster starts nothing — owner_cafe, not a Shift", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(SCAN_AT) });
  const { owner, cafeId, posterCode } = await rosterFixture(app);

  const res = await scanPoster(app, posterCode, owner);

  expect(res.status).toBe(200);
  const result = posterScanResultSchema.parse(await res.json());
  expect(result).toEqual({ status: "owner_cafe", cafeName: "Кавця «Ростер»" });
  // No grant: the owner is not on their own shift board, and holds no shift.
  const shifts = (await (
    await app.request(`/api/cafes/${cafeId}/shifts`, {
      headers: { cookie: owner },
    })
  ).json()) as unknown[];
  expect(shifts).toEqual([]);
  const mine = (await (
    await app.request("/api/me/shift", { headers: { cookie: owner } })
  ).json()) as { shift: unknown };
  expect(mine.shift).toBeNull();
  // No phantom roster row either.
  const board = rosterBoardResponseSchema.parse(
    await (await readBoard(app, cafeId, owner)).json(),
  );
  expect(board.pending).toEqual([]);
  expect(board.rostered).toEqual([]);
});

test("a pending (not yet approved) barista's scan does NOT start a Shift — still pending", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(SCAN_AT) });
  const { posterCode } = await rosterFixture(app);
  const barista = await signUp(app, "barista@example.com");
  await scanPoster(app, posterCode, barista); // raises the request; owner has NOT approved

  const res = await scanPoster(app, posterCode, barista);

  expect(res.status).toBe(200);
  expect(posterScanResultSchema.parse(await res.json()).status).toBe("pending");
});

// --- one active Shift per account: the switch (#99) --------------------------------

test("scanning a second Café's poster while on shift asks for an explicit switch", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(SCAN_AT) });
  const { owner, cafeId, posterCode } = await rosterFixture(app);
  const { barista, baristaId } = await rosterBarista(
    app,
    cafeId,
    posterCode,
    owner,
  );
  // A second Café that also rosters the same person.
  const owner2 = await signUp(app, "owner2@example.com");
  const cafe2 = await registerCafe(app, "Друга кавця", owner2);
  const poster2 = await posterCodeOf(app, cafe2, owner2);
  await scanPoster(app, poster2, barista);
  await approve(app, cafe2, baristaId, owner2);
  // On shift at Café 1.
  expect((await scanPoster(app, posterCode, barista)).status).toBe(201);

  // Scanning Café 2's poster now conflicts.
  const res = await scanPoster(app, poster2, barista);

  expect(res.status).toBe(200);
  const result = posterScanResultSchema.parse(await res.json());
  expect(result).toEqual({
    status: "switch_required",
    cafeName: "Друга кавця",
    currentCafeName: "Кавця «Ростер»",
  });
  // The switch has NOT happened yet — still on Café 1.
  const mine = (await (
    await app.request("/api/me/shift", { headers: { cookie: barista } })
  ).json()) as { shift: { cafeId: string } };
  expect(mine.shift.cafeId).toBe(cafeId);
});

test("confirmSwitch ends the old shift and starts the new one", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(SCAN_AT) });
  const { owner, cafeId, posterCode } = await rosterFixture(app);
  const { barista, baristaId } = await rosterBarista(
    app,
    cafeId,
    posterCode,
    owner,
  );
  const owner2 = await signUp(app, "owner2@example.com");
  const cafe2 = await registerCafe(app, "Друга кавця", owner2);
  const poster2 = await posterCodeOf(app, cafe2, owner2);
  await scanPoster(app, poster2, barista);
  await approve(app, cafe2, baristaId, owner2);
  expect((await scanPoster(app, posterCode, barista)).status).toBe(201);

  const res = await scanPoster(app, poster2, barista, true);

  expect(res.status).toBe(201);
  const result = posterScanResultSchema.parse(await res.json());
  expect(result.status).toBe("shift_started");
  // Now on Café 2 — exactly one active shift.
  const mine = (await (
    await app.request("/api/me/shift", { headers: { cookie: barista } })
  ).json()) as { shift: { cafeId: string } };
  expect(mine.shift.cafeId).toBe(cafe2);
  // Café 1's board no longer lists them — the old shift ended.
  const board1 = (await (
    await app.request(`/api/cafes/${cafeId}/shifts`, {
      headers: { cookie: owner },
    })
  ).json()) as unknown[];
  expect(board1).toEqual([]);
});

// --- the Roster board: approve + remove --------------------------------------------

test("the demoable loop: scan → owner approves → the account is rostered", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(SCAN_AT) });
  const { owner, cafeId, posterCode } = await rosterFixture(app);
  const { baristaId } = await rosterBarista(app, cafeId, posterCode, owner);

  const board = rosterBoardResponseSchema.parse(
    await (await readBoard(app, cafeId, owner)).json(),
  );
  expect(board.pending).toEqual([]);
  expect(board.rostered.map((r) => r.userId)).toEqual([baristaId]);
  expect(board.rostered[0]?.name).toBe("Test");
});

test("removing a rostered barista drops them back to none", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(SCAN_AT) });
  const { owner, cafeId, posterCode } = await rosterFixture(app);
  const { baristaId } = await rosterBarista(app, cafeId, posterCode, owner);

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

// --- removal instantly terminates an active Shift (#99) ----------------------------

test("removing a barista mid-shift ends it at once: the next scan is out and the app drops off shift", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(SCAN_AT) });
  const { owner, cafeId, posterCode } = await rosterFixture(app);
  const { barista, baristaId } = await rosterBarista(
    app,
    cafeId,
    posterCode,
    owner,
  );
  expect((await scanPoster(app, posterCode, barista)).status).toBe(201);
  const customer = await signUp(app, "customer@example.com");
  const qr = (await (
    await app.request("/api/qr-token", { headers: { cookie: customer } })
  ).json()) as { token: string };

  // The owner removes them from the roster.
  expect((await remove(app, cafeId, baristaId, owner)).status).toBe(204);

  // The very next scan is rejected — the grant is gone, no client polling.
  const scan = await app.request("/api/purchases", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: barista },
    body: JSON.stringify({ cafeId, qrToken: qr.token }),
  });
  expect(scan.status).toBe(404);
  // And the app re-derives out of Scanner Mode: no active shift left.
  const mine = (await (
    await app.request("/api/me/shift", { headers: { cookie: barista } })
  ).json()) as { shift: unknown };
  expect(mine.shift).toBeNull();
});

test("a removed barista's next poster scan raises a fresh request — it does not start a Shift (no denylist)", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(SCAN_AT) });
  const { owner, cafeId, posterCode } = await rosterFixture(app);
  const { barista, baristaId } = await rosterBarista(
    app,
    cafeId,
    posterCode,
    owner,
  );
  expect((await remove(app, cafeId, baristaId, owner)).status).toBe(204);

  // No longer rostered: the scan raises a request (the same not-authorized path
  // a removal racing a scan falls into — never a phantom shift).
  const res = await scanPoster(app, posterCode, barista);

  expect(res.status).toBe(200);
  expect(posterScanResultSchema.parse(await res.json()).status).toBe("pending");
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
