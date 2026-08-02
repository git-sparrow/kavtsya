import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import {
  myShiftResponseSchema,
  purchaseResultSchema,
  rosterBoardResponseSchema,
  shiftsResponseSchema,
} from "@kavtsya/shared";
import type { Auth } from "../src/auth";
import { fixedClock } from "../src/clock";
import type { Database } from "../src/db";
import { clearPlatformConfigCache } from "../src/platform-config";
import { makeApp, registerCafe, signUp } from "./helpers/app";
import { setupTestAuth, setupTestDb } from "./helpers/testDb";

/**
 * «Зміна» — poster-started shifts (#98/#99, ADR 0013). A rostered barista scans
 * the Café's wall poster and gains scan + Redemption confirm at that Café until
 * they end it, the owner ends it, or the rolling ~16h cap expires. No invite
 * handshake exists anymore. Driven through the HTTP seam; expiry runs on the
 * injected clock.
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
  // cascade also clears purchases and grants (they reference cafes/user).
  await db`truncate "user", "session", "account", "verification", cafes cascade`;
  await db`truncate fortunes`;
  clearPlatformConfigCache();
});

/** Mid-afternoon in Kyiv summer time — expiries are asserted against it. */
const OPEN_AT = new Date("2026-07-10T12:00:00Z");

/** The rolling ~16h cap from OPEN_AT: 12:00Z + 16h. */
const SHIFT_EXPIRES_AT = "2026-07-11T04:00:00.000Z";
/** One second past the cap — the auto-expire boundary. */
const AFTER_EXPIRY = new Date("2026-07-11T04:00:01Z");

async function userId(
  app: ReturnType<typeof makeApp>,
  cookie: string,
): Promise<string> {
  const res = await app.request("/api/me", { headers: { cookie } });
  return ((await res.json()) as { id: string }).id;
}

async function posterCodeOf(
  app: ReturnType<typeof makeApp>,
  cafeId: string,
  owner: string,
): Promise<string> {
  const res = await app.request(`/api/cafes/${cafeId}/roster`, {
    headers: { cookie: owner },
  });
  return rosterBoardResponseSchema.parse(await res.json()).posterCode;
}

function scanPoster(
  app: ReturnType<typeof makeApp>,
  posterCode: string,
  cookie?: string,
) {
  return app.request("/api/poster-scans", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ posterCode }),
  });
}

async function qrTokenFor(
  app: ReturnType<typeof makeApp>,
  cookie: string,
): Promise<string> {
  const res = await app.request("/api/qr-token", { headers: { cookie } });
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

function issuePurchase(
  app: ReturnType<typeof makeApp>,
  body: unknown,
  cookie: string,
) {
  return app.request("/api/purchases", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

/**
 * A barista on shift at a fresh Café: signed up, rostered (scan → owner
 * approves), then poster-scanned onto a Shift. The one fixture the counter
 * tests start from.
 */
async function shiftOnDuty(
  app: ReturnType<typeof makeApp>,
  baristaEmail = "barista@example.com",
) {
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця «Зміна»", owner);
  const posterCode = await posterCodeOf(app, cafeId, owner);
  const barista = await signUp(app, baristaEmail);
  const baristaId = await userId(app, barista);
  await scanPoster(app, posterCode, barista);
  expect(
    (
      await app.request(`/api/cafes/${cafeId}/roster/${baristaId}/approve`, {
        method: "POST",
        headers: { cookie: owner },
      })
    ).status,
  ).toBe(204);
  const started = await scanPoster(app, posterCode, barista);
  expect(started.status).toBe(201);
  return { owner, cafeId, posterCode, barista, baristaId };
}

/** Roster + approve a second barista at an existing Café. */
async function rosterColleague(
  app: ReturnType<typeof makeApp>,
  cafeId: string,
  posterCode: string,
  owner: string,
  email: string,
) {
  const colleague = await signUp(app, email);
  const colleagueId = await userId(app, colleague);
  await scanPoster(app, posterCode, colleague);
  await app.request(`/api/cafes/${cafeId}/roster/${colleagueId}/approve`, {
    method: "POST",
    headers: { cookie: owner },
  });
  return colleague;
}

// --- the retired invite endpoints are gone (#98) -----------------------------------

test("the owner-shown invite endpoints no longer exist", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця", owner);

  const open = await app.request(`/api/cafes/${cafeId}/shift-invites`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: owner },
    body: "{}",
  });
  const accept = await app.request("/api/shift-invites/accept", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: owner },
    body: JSON.stringify({ inviteToken: "anything" }),
  });

  expect(open.status).toBe(404);
  expect(accept.status).toBe(404);
});

// --- the shift at the counter ------------------------------------------------------

test("full lifecycle: the barista scans a Customer and the Purchase records who issued it", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { cafeId, barista } = await shiftOnDuty(app);
  const customer = await signUp(app, "customer@example.com");

  const res = await issuePurchase(
    app,
    { cafeId, qrToken: await qrTokenFor(app, customer) },
    barista,
  );

  expect(res.status).toBe(201);
  expect(purchaseResultSchema.parse(await res.json()).balance).toBe(1);
  const [row] = await db<{ issued_by_user_id: string | null }[]>`
    select "issued_by_user_id" from purchases where "cafe_id" = ${cafeId}
  `;
  expect(row?.issued_by_user_id).toBe(await userId(app, barista));
});

test("the manual member-code path records the issuer as well (#21 coordination)", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { cafeId, barista } = await shiftOnDuty(app);
  const customer = await signUp(app, "customer@example.com");
  const { memberCode } = (await (
    await app.request("/api/me/member-code", { headers: { cookie: customer } })
  ).json()) as { memberCode: string };

  const res = await issuePurchase(app, { cafeId, memberCode }, barista);

  expect(res.status).toBe(201);
  const [row] = await db<{ issued_by_user_id: string | null }[]>`
    select "issued_by_user_id" from purchases where "cafe_id" = ${cafeId}
  `;
  expect(row?.issued_by_user_id).toBe(await userId(app, barista));
});

test("the grant is café-scoped: the same barista is nobody at another Café", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { barista } = await shiftOnDuty(app);
  const otherOwner = await signUp(app, "other.owner@example.com");
  const otherCafe = await registerCafe(app, "Чужа кавця", otherOwner);
  const customer = await signUp(app, "customer@example.com");

  const res = await issuePurchase(
    app,
    { cafeId: otherCafe, qrToken: await qrTokenFor(app, customer) },
    barista,
  );

  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "not_found" });
});

test("the shift auto-expires: past the ~16h cap the barista who wasn't revoked is still out", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { cafeId, barista } = await shiftOnDuty(app);
  const customer = await signUp(app, "customer@example.com");
  const expired = makeApp({ db, auth, clock: fixedClock(AFTER_EXPIRY) });

  const res = await issuePurchase(
    expired,
    { cafeId, qrToken: await qrTokenFor(expired, customer) },
    barista,
  );

  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "not_found" });
});

test("the auto-expire is a rolling cap, not Café hours: a shift crosses midnight untouched", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { cafeId, barista } = await shiftOnDuty(app);
  const customer = await signUp(app, "customer@example.com");
  // 03:00Z next day = 06:00 Kyiv — well past midnight, still inside the 16h cap.
  const nextMorning = makeApp({
    db,
    auth,
    clock: fixedClock(new Date("2026-07-11T03:00:00Z")),
  });

  const res = await issuePurchase(
    nextMorning,
    { cafeId, qrToken: await qrTokenFor(nextMorning, customer) },
    barista,
  );

  expect(res.status).toBe(201);
});

// --- the self-farm guards (ADR 0003 + ADR 0013, additive) --------------------------

test("nobody scans their own code: the barista's own QR is self_scan", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { cafeId, barista } = await shiftOnDuty(app);

  const res = await issuePurchase(
    app,
    { cafeId, qrToken: await qrTokenFor(app, barista) },
    barista,
  );

  expect(res.status).toBe(403);
  expect(await res.json()).toEqual({ error: "self_scan" });
});

test("the owner scanned BY their barista still earns nothing at their own Café (own_cafe stays)", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { owner, cafeId, barista } = await shiftOnDuty(app);

  const res = await issuePurchase(
    app,
    { cafeId, qrToken: await qrTokenFor(app, owner) },
    barista,
  );

  expect(res.status).toBe(403);
  expect(await res.json()).toEqual({ error: "own_cafe" });
});

test("a barista scanned by a colleague earns normally — staffing costs no perks", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { owner, cafeId, posterCode, barista } = await shiftOnDuty(app);
  const colleague = await rosterColleague(
    app,
    cafeId,
    posterCode,
    owner,
    "colleague@example.com",
  );
  expect((await scanPoster(app, posterCode, colleague)).status).toBe(201);

  const res = await issuePurchase(
    app,
    { cafeId, qrToken: await qrTokenFor(app, barista) },
    colleague,
  );

  expect(res.status).toBe(201);
  expect(purchaseResultSchema.parse(await res.json()).balance).toBe(1);
});

// --- the shift's second power: Redemption confirm ----------------------------------

test("the grant holder confirms a Redemption off the same single scan", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { owner, cafeId, barista } = await shiftOnDuty(app);
  await app.request(`/api/cafes/${cafeId}/program`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: owner },
    body: JSON.stringify({ threshold: 2, reward: { type: "free_drink" } }),
  });
  const customer = await signUp(app, "customer@example.com");
  let customerId = "";
  for (let i = 0; i < 2; i++) {
    const scan = await issuePurchase(
      app,
      { cafeId, qrToken: await qrTokenFor(app, customer) },
      barista,
    );
    expect(scan.status).toBe(201);
    customerId = purchaseResultSchema.parse(await scan.json()).customerId;
  }

  const res = await app.request("/api/redemptions", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: barista },
    body: JSON.stringify({ cafeId, customerId, idempotencyKey: "shift-1" }),
  });

  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({
    balance: 0,
    beansSpent: 2,
    reward: { type: "free_drink" },
  });
});

// --- scope: scan + confirm is ALL the shift grants ---------------------------------

test("the grant holder cannot touch the loyalty config — owner endpoints stay owner-only", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { cafeId, barista } = await shiftOnDuty(app);

  const read = await app.request(`/api/cafes/${cafeId}/program`, {
    headers: { cookie: barista },
  });
  const write = await app.request(`/api/cafes/${cafeId}/program`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: barista },
    body: JSON.stringify({ threshold: 1, reward: null }),
  });

  expect(read.status).toBe(404);
  expect(write.status).toBe(404);
});

// --- the owner's shift board: list + revoke ----------------------------------------

test("the owner sees who is on shift; a revoked shift ends immediately", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { owner, cafeId, barista } = await shiftOnDuty(app);
  const customer = await signUp(app, "customer@example.com");

  const board = shiftsResponseSchema.parse(
    await (
      await app.request(`/api/cafes/${cafeId}/shifts`, {
        headers: { cookie: owner },
      })
    ).json(),
  );
  expect(board.active).toHaveLength(1);
  expect(board.active[0]).toMatchObject({
    baristaName: "Test",
    startedAt: OPEN_AT.toISOString(),
    expiresAt: SHIFT_EXPIRES_AT,
    scanCount: 0,
  });
  expect(board.completedToday).toEqual([]);

  const revokeRes = await app.request(
    `/api/cafes/${cafeId}/shifts/${board.active[0]!.id}`,
    { method: "DELETE", headers: { cookie: owner } },
  );
  expect(revokeRes.status).toBe(204);

  const scan = await issuePurchase(
    app,
    { cafeId, qrToken: await qrTokenFor(app, customer) },
    barista,
  );
  expect(scan.status).toBe(404);
  // Revoked now, ended today: off the active board, onto «завершені сьогодні».
  const after = shiftsResponseSchema.parse(
    await (
      await app.request(`/api/cafes/${cafeId}/shifts`, {
        headers: { cookie: owner },
      })
    ).json(),
  );
  expect(after.active).toEqual([]);
  expect(after.completedToday).toHaveLength(1);
  expect(after.completedToday[0]).toMatchObject({
    baristaName: "Test",
    endedAt: OPEN_AT.toISOString(),
    scanCount: 0,
  });
});

test("the board tallies each shift's scans and keeps the count once it closes", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { owner, cafeId, baristaId } = await shiftOnDuty(app);

  // Seed two Зернятка issued by this barista during the shift window, backdated
  // to the pinned clock — the same direct-SQL seam the analytics suite uses,
  // since the HTTP issue path stamps `created_at` with the real DB clock.
  for (let i = 0; i < 2; i++) {
    const customer = await signUp(app, `c${i}@example.com`);
    await db`
      insert into purchases
        ("cafe_id", "customer_user_id", "qr_jti", "entry_source",
         "issued_by_user_id", "created_at")
      values
        (${cafeId}, ${await userId(app, customer)}, ${crypto.randomUUID()},
         'qr', ${baristaId}, ${OPEN_AT})
    `;
  }

  const onDuty = shiftsResponseSchema.parse(
    await (
      await app.request(`/api/cafes/${cafeId}/shifts`, {
        headers: { cookie: owner },
      })
    ).json(),
  );
  expect(onDuty.active[0]?.scanCount).toBe(2);

  // Ending the shift moves it to «завершені сьогодні» with the same tally — a
  // closed shift keeps the scans it earned.
  await app.request(`/api/cafes/${cafeId}/shifts/${onDuty.active[0]!.id}`, {
    method: "DELETE",
    headers: { cookie: owner },
  });
  const closed = shiftsResponseSchema.parse(
    await (
      await app.request(`/api/cafes/${cafeId}/shifts`, {
        headers: { cookie: owner },
      })
    ).json(),
  );
  expect(closed.active).toEqual([]);
  expect(closed.completedToday[0]?.scanCount).toBe(2);
});

test("expired shifts drop off the active board and land in «завершені сьогодні»", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { owner, cafeId } = await shiftOnDuty(app);
  const expired = makeApp({ db, auth, clock: fixedClock(AFTER_EXPIRY) });

  const res = await expired.request(`/api/cafes/${cafeId}/shifts`, {
    headers: { cookie: owner },
  });

  // The rolling cap fell earlier today (Kyiv): no longer on shift, but closed
  // today — the owner still sees it ended at its expiry.
  const board = shiftsResponseSchema.parse(await res.json());
  expect(board.active).toEqual([]);
  expect(board.completedToday).toHaveLength(1);
  expect(board.completedToday[0]).toMatchObject({
    baristaName: "Test",
    endedAt: SHIFT_EXPIRES_AT,
  });
});

test("another café's owner can neither see nor revoke a shift that isn't theirs", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { owner, cafeId } = await shiftOnDuty(app);
  const rival = await signUp(app, "rival@example.com");
  await registerCafe(app, "Кавця конкурента", rival);
  const board = shiftsResponseSchema.parse(
    await (
      await app.request(`/api/cafes/${cafeId}/shifts`, {
        headers: { cookie: owner },
      })
    ).json(),
  );

  const foreignList = await app.request(`/api/cafes/${cafeId}/shifts`, {
    headers: { cookie: rival },
  });
  const foreignRevoke = await app.request(
    `/api/cafes/${cafeId}/shifts/${board.active[0]!.id}`,
    { method: "DELETE", headers: { cookie: rival } },
  );

  expect(foreignList.status).toBe(404);
  expect(foreignRevoke.status).toBe(404);
  const after = await app.request(`/api/cafes/${cafeId}/shifts`, {
    headers: { cookie: owner },
  });
  expect(shiftsResponseSchema.parse(await after.json()).active).toHaveLength(1);
});

// --- the barista's app asks "am I on shift?" ----------------------------------------

test("GET /api/me/shift carries the active shift the banner renders — and null once it lapses", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { cafeId, barista } = await shiftOnDuty(app);

  const onShift = await app.request("/api/me/shift", {
    headers: { cookie: barista },
  });
  expect(onShift.status).toBe(200);
  expect(myShiftResponseSchema.parse(await onShift.json())).toEqual({
    shift: {
      cafeId,
      cafeName: "Кавця «Зміна»",
      expiresAt: SHIFT_EXPIRES_AT,
    },
  });

  const expired = makeApp({ db, auth, clock: fixedClock(AFTER_EXPIRY) });
  const after = await expired.request("/api/me/shift", {
    headers: { cookie: barista },
  });
  expect(myShiftResponseSchema.parse(await after.json())).toEqual({
    shift: null,
  });
});

// --- the barista ends their own shift (#96, ADR 0015) -------------------------------

function endMyShift(app: ReturnType<typeof makeApp>, cookie?: string) {
  return app.request("/api/me/shift", {
    method: "DELETE",
    headers: { ...(cookie ? { cookie } : {}) },
  });
}

test("«Завершити зміну» ends the barista's own shift: the next scan is out, and the owner's board clears", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { owner, cafeId, barista } = await shiftOnDuty(app);
  const customer = await signUp(app, "customer@example.com");

  expect((await endMyShift(app, barista)).status).toBe(204);

  const mine = await app.request("/api/me/shift", {
    headers: { cookie: barista },
  });
  expect(myShiftResponseSchema.parse(await mine.json())).toEqual({
    shift: null,
  });
  const scan = await issuePurchase(
    app,
    { cafeId, qrToken: await qrTokenFor(app, customer) },
    barista,
  );
  expect(scan.status).toBe(404);
  const board = await app.request(`/api/cafes/${cafeId}/shifts`, {
    headers: { cookie: owner },
  });
  expect(shiftsResponseSchema.parse(await board.json()).active).toEqual([]);
});

test("ending a shift is idempotent — a second «Завершити зміну» with none active still succeeds", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { barista } = await shiftOnDuty(app);

  expect((await endMyShift(app, barista)).status).toBe(204);
  expect((await endMyShift(app, barista)).status).toBe(204);
});

test("ending my shift never touches a colleague's — each grant is its own", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { owner, cafeId, posterCode, barista } = await shiftOnDuty(app);
  const colleague = await rosterColleague(
    app,
    cafeId,
    posterCode,
    owner,
    "colleague@example.com",
  );
  expect((await scanPoster(app, posterCode, colleague)).status).toBe(201);

  expect((await endMyShift(app, barista)).status).toBe(204);

  const theirs = await app.request("/api/me/shift", {
    headers: { cookie: colleague },
  });
  expect(myShiftResponseSchema.parse(await theirs.json()).shift?.cafeId).toBe(
    cafeId,
  );
});

// --- cross-family confusion holds: a Customer QR is not a poster scan ---------------

test("a valid shift-era token is not accepted as a poster code (poster codes are not tokens)", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { posterCode } = await shiftOnDuty(app);
  void posterCode;
  const customer = await signUp(app, "customer@example.com");
  const token = await qrTokenFor(app, customer);

  // A long signed token is not a poster code — it resolves to no Café.
  const res = await scanPoster(app, token, customer);

  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "unknown_poster" });
});

test("a valid Customer QR presented to the scan endpoint still earns normally for the owner", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця", owner);
  const customer = await signUp(app, "customer@example.com");

  const res = await issuePurchase(
    app,
    { cafeId, qrToken: await qrTokenFor(app, customer) },
    owner,
  );

  expect(res.status).toBe(201);
  const [row] = await db<{ issued_by_user_id: string | null }[]>`
    select "issued_by_user_id" from purchases where "cafe_id" = ${cafeId}
  `;
  expect(row?.issued_by_user_id).toBe(await userId(app, owner));
});
