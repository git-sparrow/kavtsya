import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import {
  acceptShiftInviteResultSchema,
  myShiftResponseSchema,
  purchaseResultSchema,
  shiftInviteResponseSchema,
  shiftsResponseSchema,
} from "@kavtsya/shared";
import type { Auth } from "../src/auth";
import { fixedClock } from "../src/clock";
import type { Database } from "../src/db";
import { clearPlatformConfigCache } from "../src/platform-config";
import { deriveTokenKey, encodeSignedToken } from "../src/signed-token";
import { makeApp, registerCafe, signUp } from "./helpers/app";
import { setupTestAuth, setupTestDb } from "./helpers/testDb";

/**
 * «Зміна» — staff scanner grants (#80, ADR 0013): the CafeOwner opens a shift
 * (an invite QR + short code), the barista's own account accepts it and gains
 * scan + Redemption confirm at that Café until the grant expires or is revoked.
 * Driven through the HTTP seam like the purchase/redemption suites; expiry runs
 * on the injected clock.
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
  // cascade also clears purchases, grants, and invites (they reference cafes).
  await db`truncate "user", "session", "account", "verification", cafes cascade`;
  await db`truncate fortunes`;
  clearPlatformConfigCache();
});

/** Mid-afternoon in Kyiv summer time (15:00 EEST) — expiries are asserted against it. */
const OPEN_AT = new Date("2026-07-10T12:00:00Z");

function openShiftInvite(
  app: ReturnType<typeof makeApp>,
  cafeId: string,
  cookie: string | undefined,
  body: unknown = {},
) {
  return app.request(`/api/cafes/${cafeId}/shift-invites`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

// --- opening a shift -----------------------------------------------------------

test("opening a shift mints an invite: QR token + short code, grant lasting to Kyiv midnight", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця", owner);

  const res = await openShiftInvite(app, cafeId, owner);

  expect(res.status).toBe(201);
  const invite = shiftInviteResponseSchema.parse(await res.json());
  // The invite itself is short-lived: ten minutes to get it in front of the barista.
  expect(invite.inviteExpiresAt).toBe("2026-07-10T12:10:00.000Z");
  // The grant it will mint self-heals at the end of the café's business day:
  // next Europe/Kyiv midnight (00:00 EEST on the 11th = 21:00 UTC on the 10th).
  expect(invite.grantExpiresAt).toBe("2026-07-10T21:00:00.000Z");
  // The signed token the QR renders and the typable fallback differ in kind.
  expect(invite.inviteToken).toContain(".");
  expect(invite.inviteCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
});

test("an explicit shorter duration trims the grant — the trial-barista window", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця", owner);

  const res = await openShiftInvite(app, cafeId, owner, {
    durationMinutes: 120,
  });

  expect(res.status).toBe(201);
  const invite = shiftInviteResponseSchema.parse(await res.json());
  expect(invite.grantExpiresAt).toBe("2026-07-10T14:00:00.000Z");
});

test("a duration reaching past closing time is clamped to Kyiv midnight — a shift never outlives the business day", async () => {
  // 23:00 Kyiv + 8h would land mid-tomorrow; the ceiling holds it at 00:00.
  const app = makeApp({
    db,
    auth,
    clock: fixedClock(new Date("2026-07-10T20:00:00Z")),
  });
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця", owner);

  const res = await openShiftInvite(app, cafeId, owner, {
    durationMinutes: 480,
  });

  const invite = shiftInviteResponseSchema.parse(await res.json());
  expect(invite.grantExpiresAt).toBe("2026-07-10T21:00:00.000Z");
});

test("the business day ends at KYIV midnight in winter too (EET, +02:00)", async () => {
  const app = makeApp({
    db,
    auth,
    clock: fixedClock(new Date("2026-01-10T12:00:00Z")),
  });
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця", owner);

  const res = await openShiftInvite(app, cafeId, owner);

  const invite = shiftInviteResponseSchema.parse(await res.json());
  // 2026-01-11 00:00 EET = 2026-01-10 22:00 UTC.
  expect(invite.grantExpiresAt).toBe("2026-01-10T22:00:00.000Z");
});

test("opening a shift at a Café the caller does not own is not found", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const alice = await signUp(app, "alice@example.com");
  const bob = await signUp(app, "bob@example.com");
  const aliceCafe = await registerCafe(app, "Кавця Аліси", alice);

  const res = await openShiftInvite(app, aliceCafe, bob);

  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "not_found" });
});

test("opening a shift requires authentication", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця", owner);

  const res = await openShiftInvite(app, cafeId, undefined);

  expect(res.status).toBe(401);
});

// --- accepting an invite ---------------------------------------------------------

function acceptInvite(
  app: ReturnType<typeof makeApp>,
  body: unknown,
  cookie?: string,
) {
  return app.request("/api/shift-invites/accept", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

/** Owner + café + a fresh invite — the fixture most accept tests start from. */
async function shiftFixture(app: ReturnType<typeof makeApp>) {
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця «Зміна»", owner);
  const inviteRes = await openShiftInvite(app, cafeId, owner);
  expect(inviteRes.status).toBe(201);
  const invite = shiftInviteResponseSchema.parse(await inviteRes.json());
  return { owner, cafeId, invite };
}

test("the barista scans the invite QR and the shift starts: token accept mints the grant", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { cafeId, invite } = await shiftFixture(app);
  const barista = await signUp(app, "barista@example.com");

  const res = await acceptInvite(
    app,
    { inviteToken: invite.inviteToken },
    barista,
  );

  expect(res.status).toBe(201);
  const shift = acceptShiftInviteResultSchema.parse(await res.json());
  expect(shift).toEqual({
    cafeId,
    cafeName: "Кавця «Зміна»",
    // The shift the barista sees ends exactly when the invite promised the owner.
    expiresAt: invite.grantExpiresAt,
  });
});

test("the camera-won't-cooperate fallback: typing the short code accepts the same invite", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { cafeId, invite } = await shiftFixture(app);
  const barista = await signUp(app, "barista@example.com");

  // Typed sloppily — lowercase, hyphenated like the on-screen grouping (#21's
  // normalization affordance is shared).
  const typed =
    `${invite.inviteCode.slice(0, 4)}-${invite.inviteCode.slice(4)}`.toLowerCase();
  const res = await acceptInvite(app, { inviteCode: typed }, barista);

  expect(res.status).toBe(201);
  const shift = acceptShiftInviteResultSchema.parse(await res.json());
  expect(shift.cafeId).toBe(cafeId);
});

test("accepting an invite requires authentication — the grant needs an account to attach to", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { invite } = await shiftFixture(app);

  const res = await acceptInvite(app, { inviteToken: invite.inviteToken });

  expect(res.status).toBe(401);
});

// --- invite misuse ---------------------------------------------------------------

test("one invite admits one barista: the second accept is rejected, whichever form it takes", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { invite } = await shiftFixture(app);
  const first = await signUp(app, "first.barista@example.com");
  const second = await signUp(app, "second.barista@example.com");
  expect(
    (await acceptInvite(app, { inviteToken: invite.inviteToken }, first))
      .status,
  ).toBe(201);

  // A photographed invite screen carries both renderings — neither admits.
  const viaToken = await acceptInvite(
    app,
    { inviteToken: invite.inviteToken },
    second,
  );
  const viaCode = await acceptInvite(
    app,
    { inviteCode: invite.inviteCode },
    second,
  );

  expect(viaToken.status).toBe(409);
  expect(await viaToken.json()).toEqual({ error: "invite_used" });
  expect(viaCode.status).toBe(409);
  expect(await viaCode.json()).toEqual({ error: "invite_used" });
});

test("an expired invite admits nobody — the owner mints a fresh one instead", async () => {
  const mintApp = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { invite } = await shiftFixture(mintApp);
  // Eleven minutes later: past the invite's ten, well before the grant's midnight.
  const lateApp = makeApp({
    db,
    auth,
    clock: fixedClock(new Date(OPEN_AT.getTime() + 11 * 60_000)),
  });
  const barista = await signUp(lateApp, "barista@example.com");

  const viaToken = await acceptInvite(
    lateApp,
    { inviteToken: invite.inviteToken },
    barista,
  );
  const viaCode = await acceptInvite(
    lateApp,
    { inviteCode: invite.inviteCode },
    barista,
  );

  expect(viaToken.status).toBe(401);
  expect(await viaToken.json()).toEqual({ error: "expired_invite" });
  expect(viaCode.status).toBe(401);
  expect(await viaCode.json()).toEqual({ error: "expired_invite" });
});

test("a tampered invite token is rejected", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { invite } = await shiftFixture(app);
  const barista = await signUp(app, "barista@example.com");
  const tampered =
    invite.inviteToken.slice(0, -1) +
    (invite.inviteToken.endsWith("A") ? "B" : "A");

  const res = await acceptInvite(app, { inviteToken: tampered }, barista);

  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "invalid_invite" });
});

test("a correctly-signed invite re-pointed at another Café is rejected", async () => {
  const secret = "shift-suite-secret-at-least-32-chars-long";
  const app = makeApp({
    db,
    auth,
    clock: fixedClock(OPEN_AT),
    qrTokenSecret: secret,
  });
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця", owner);
  const otherCafe = await registerCafe(app, "Інша кавця", owner);
  const inviteRes = await openShiftInvite(app, cafeId, owner);
  const invite = shiftInviteResponseSchema.parse(await inviteRes.json());
  const barista = await signUp(app, "barista@example.com");

  // Re-sign the real payload for the other Café — valid signature, real jti,
  // wrong café: the row is the source of truth and disagrees.
  const [body] = invite.inviteToken.split(".");
  const payload = JSON.parse(
    Buffer.from(body!, "base64url").toString(),
  ) as Record<string, unknown>;
  const forged = encodeSignedToken(
    { ...payload, sub: otherCafe },
    deriveTokenKey(secret, "shift-invite"),
  );

  const res = await acceptInvite(app, { inviteToken: forged }, barista);

  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "invalid_invite" });
});

test("a short code nobody minted is rejected", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  await shiftFixture(app);
  const barista = await signUp(app, "barista@example.com");

  const res = await acceptInvite(app, { inviteCode: "ZZZZ9999" }, barista);

  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "invalid_invite" });
});

// --- cross-family confusion (the #80 security amendment) --------------------------
//
// Two token families off ONE secret: the Customer QR and the shift invite.
// Domain separation is cryptographic (derived per-family keys), so each
// validator must reject the other family's token outright — these are the
// regression tests the amendment demands.

test("a valid Customer QR presented to the shift-accept endpoint is rejected", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  await shiftFixture(app);
  const customer = await signUp(app, "customer@example.com");
  const qrRes = await app.request("/api/qr-token", {
    headers: { cookie: customer },
  });
  const { token } = (await qrRes.json()) as { token: string };

  const res = await acceptInvite(app, { inviteToken: token }, customer);

  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "invalid_invite" });
});

test("a valid shift-invite token presented to the scan endpoint is rejected as invalid_token", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { owner, cafeId, invite } = await shiftFixture(app);

  const res = await app.request("/api/purchases", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: owner },
    body: JSON.stringify({ cafeId, qrToken: invite.inviteToken }),
  });

  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "invalid_token" });
});

// --- the shift at the counter ------------------------------------------------------
//
// The grant holder gets exactly the owner's two counter powers — scan and
// Redemption confirm — at exactly one Café, for exactly the shift's window.

/** A user's id as the app sees it. */
async function userId(
  app: ReturnType<typeof makeApp>,
  cookie: string,
): Promise<string> {
  const res = await app.request("/api/me", { headers: { cookie } });
  const { id } = (await res.json()) as { id: string };
  return id;
}

async function qrTokenFor(
  app: ReturnType<typeof makeApp>,
  cookie: string,
): Promise<string> {
  const res = await app.request("/api/qr-token", { headers: { cookie } });
  expect(res.status).toBe(200);
  const { token } = (await res.json()) as { token: string };
  return token;
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

/** Fixture: a shift already accepted — the barista is behind the counter. */
async function shiftOnDuty(app: ReturnType<typeof makeApp>) {
  const { owner, cafeId, invite } = await shiftFixture(app);
  const barista = await signUp(app, "barista@example.com");
  const accepted = await acceptInvite(
    app,
    { inviteToken: invite.inviteToken },
    barista,
  );
  expect(accepted.status).toBe(201);
  return { owner, cafeId, barista };
}

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
  const result = purchaseResultSchema.parse(await res.json());
  expect(result.balance).toBe(1);
  // The audit trail (#62's hook) has no read endpoint yet — the ledger row
  // itself is the deliverable, so this one assertion reads it directly.
  const [row] = await db<{ issued_by_user_id: string | null }[]>`
    select "issued_by_user_id" from purchases where "cafe_id" = ${cafeId}
  `;
  expect(row?.issued_by_user_id).toBe(await userId(app, barista));
});

test("the owner's own scan records them as the issuer too", async () => {
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

test("the manual member-code path records the issuer as well (#21 coordination)", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { cafeId, barista } = await shiftOnDuty(app);
  const customer = await signUp(app, "customer@example.com");
  const codeRes = await app.request("/api/me/member-code", {
    headers: { cookie: customer },
  });
  const { memberCode } = (await codeRes.json()) as { memberCode: string };

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

test("the grant self-heals: past Kyiv midnight the barista who wasn't revoked is still out", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { cafeId, barista } = await shiftOnDuty(app);
  const customer = await signUp(app, "customer@example.com");
  // 21:00:01 UTC = one second past the grant's Kyiv-midnight expiry.
  const nextDay = makeApp({
    db,
    auth,
    clock: fixedClock(new Date("2026-07-10T21:00:01Z")),
  });

  const res = await issuePurchase(
    nextDay,
    { cafeId, qrToken: await qrTokenFor(nextDay, customer) },
    barista,
  );

  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "not_found" });
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

test("nobody scans their own code: one's own member code is self_scan too", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { cafeId, barista } = await shiftOnDuty(app);
  const codeRes = await app.request("/api/me/member-code", {
    headers: { cookie: barista },
  });
  const { memberCode } = (await codeRes.json()) as { memberCode: string };

  const res = await issuePurchase(app, { cafeId, memberCode }, barista);

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
  const { owner, cafeId, barista } = await shiftOnDuty(app);
  // The colleague joins through «Запросити ще» — a fresh invite.
  const secondInviteRes = await openShiftInvite(app, cafeId, owner);
  const secondInvite = shiftInviteResponseSchema.parse(
    await secondInviteRes.json(),
  );
  const colleague = await signUp(app, "colleague@example.com");
  expect(
    (
      await acceptInvite(
        app,
        { inviteToken: secondInvite.inviteToken },
        colleague,
      )
    ).status,
  ).toBe(201);

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
  // Reward + threshold 2 so two scans make the Customer eligible.
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

test("an expired grant confirms nothing either", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { owner, cafeId, barista } = await shiftOnDuty(app);
  await app.request(`/api/cafes/${cafeId}/program`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: owner },
    body: JSON.stringify({ threshold: 1, reward: { type: "free_drink" } }),
  });
  const customer = await signUp(app, "customer@example.com");
  const scan = await issuePurchase(
    app,
    { cafeId, qrToken: await qrTokenFor(app, customer) },
    barista,
  );
  const { customerId } = purchaseResultSchema.parse(await scan.json());
  const nextDay = makeApp({
    db,
    auth,
    clock: fixedClock(new Date("2026-07-10T21:00:01Z")),
  });

  const res = await nextDay.request("/api/redemptions", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: barista },
    body: JSON.stringify({ cafeId, customerId, idempotencyKey: "late-1" }),
  });

  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "not_found" });
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

  const listRes = await app.request(`/api/cafes/${cafeId}/shifts`, {
    headers: { cookie: owner },
  });
  expect(listRes.status).toBe(200);
  const shifts = shiftsResponseSchema.parse(await listRes.json());
  expect(shifts).toHaveLength(1);
  expect(shifts[0]).toMatchObject({
    baristaName: "Test",
    expiresAt: "2026-07-10T21:00:00.000Z",
  });

  const revokeRes = await app.request(
    `/api/cafes/${cafeId}/shifts/${shifts[0]!.id}`,
    { method: "DELETE", headers: { cookie: owner } },
  );
  expect(revokeRes.status).toBe(204);

  // Revocation is a tap, not a password change: the very next scan is out…
  const scan = await issuePurchase(
    app,
    { cafeId, qrToken: await qrTokenFor(app, customer) },
    barista,
  );
  expect(scan.status).toBe(404);
  // …and the board is clear.
  const after = await app.request(`/api/cafes/${cafeId}/shifts`, {
    headers: { cookie: owner },
  });
  expect(shiftsResponseSchema.parse(await after.json())).toEqual([]);
});

test("expired shifts drop off the board on their own", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { owner, cafeId } = await shiftOnDuty(app);
  const nextDay = makeApp({
    db,
    auth,
    clock: fixedClock(new Date("2026-07-10T21:00:01Z")),
  });

  const res = await nextDay.request(`/api/cafes/${cafeId}/shifts`, {
    headers: { cookie: owner },
  });

  expect(shiftsResponseSchema.parse(await res.json())).toEqual([]);
});

test("another café's owner can neither see nor revoke a shift that isn't theirs", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { owner, cafeId } = await shiftOnDuty(app);
  const rival = await signUp(app, "rival@example.com");
  await registerCafe(app, "Кавця конкурента", rival);
  const listRes = await app.request(`/api/cafes/${cafeId}/shifts`, {
    headers: { cookie: owner },
  });
  const shifts = shiftsResponseSchema.parse(await listRes.json());

  const foreignList = await app.request(`/api/cafes/${cafeId}/shifts`, {
    headers: { cookie: rival },
  });
  const foreignRevoke = await app.request(
    `/api/cafes/${cafeId}/shifts/${shifts[0]!.id}`,
    { method: "DELETE", headers: { cookie: rival } },
  );

  expect(foreignList.status).toBe(404);
  expect(foreignRevoke.status).toBe(404);
  // The shift survived the foreign revoke attempt.
  const after = await app.request(`/api/cafes/${cafeId}/shifts`, {
    headers: { cookie: owner },
  });
  expect(shiftsResponseSchema.parse(await after.json())).toHaveLength(1);
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
      expiresAt: "2026-07-10T21:00:00.000Z",
    },
  });

  const nextDay = makeApp({
    db,
    auth,
    clock: fixedClock(new Date("2026-07-10T21:00:01Z")),
  });
  const after = await nextDay.request("/api/me/shift", {
    headers: { cookie: barista },
  });
  expect(myShiftResponseSchema.parse(await after.json())).toEqual({
    shift: null,
  });
});

// --- the barista ends their own shift (#96, ADR 0015) -------------------------------
//
// Under the derived-landing Modes an active grant pins the app to the near-kiosk
// Scanner Mode; «Завершити зміну» must actually END the grant (not merely leave
// the screen) or the barista is stranded. This is self-authorized: you may
// always end your OWN shift, no ownership needed.

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

  const res = await endMyShift(app, barista);
  expect(res.status).toBe(204);

  // The barista's app re-derives to a non-scanner Mode: no active shift left.
  const mine = await app.request("/api/me/shift", {
    headers: { cookie: barista },
  });
  expect(myShiftResponseSchema.parse(await mine.json())).toEqual({
    shift: null,
  });
  // The grant is gone, not just hidden — the very next scan is rejected.
  const scan = await issuePurchase(
    app,
    { cafeId, qrToken: await qrTokenFor(app, customer) },
    barista,
  );
  expect(scan.status).toBe(404);
  // And the owner's board no longer lists them.
  const board = await app.request(`/api/cafes/${cafeId}/shifts`, {
    headers: { cookie: owner },
  });
  expect(shiftsResponseSchema.parse(await board.json())).toEqual([]);
});

test("ending a shift is idempotent — a second «Завершити зміну» with none active still succeeds", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { barista } = await shiftOnDuty(app);

  expect((await endMyShift(app, barista)).status).toBe(204);
  // A double-tap, or a barista who was never on shift, is a no-op — not an error.
  expect((await endMyShift(app, barista)).status).toBe(204);
});

test("ending my shift never touches a colleague's — each grant is its own", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { owner, cafeId, barista } = await shiftOnDuty(app);
  // A colleague joins the same Café through «Запросити ще».
  const secondInvite = shiftInviteResponseSchema.parse(
    await (await openShiftInvite(app, cafeId, owner)).json(),
  );
  const colleague = await signUp(app, "colleague@example.com");
  expect(
    (
      await acceptInvite(
        app,
        { inviteToken: secondInvite.inviteToken },
        colleague,
      )
    ).status,
  ).toBe(201);

  expect((await endMyShift(app, barista)).status).toBe(204);

  // The colleague is still on shift.
  const theirs = await app.request("/api/me/shift", {
    headers: { cookie: colleague },
  });
  expect(myShiftResponseSchema.parse(await theirs.json()).shift?.cafeId).toBe(
    cafeId,
  );
});

test("ending a shift requires authentication", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  await shiftOnDuty(app);

  expect((await endMyShift(app)).status).toBe(401);
});

test("an invite short code typed into the member-code field identifies nobody", async () => {
  const app = makeApp({ db, auth, clock: fixedClock(OPEN_AT) });
  const { owner, cafeId, invite } = await shiftFixture(app);

  const res = await app.request("/api/purchases", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: owner },
    body: JSON.stringify({ cafeId, memberCode: invite.inviteCode }),
  });

  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "unknown_member_code" });
});
