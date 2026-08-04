import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { meResponseSchema } from "@kavtsya/shared";
import type { Auth } from "../src/auth";
import { fixedClock } from "../src/clock";
import type { Database } from "../src/db";
import type { PushMessage, PushProvider, PushReceipt } from "../src/push";
import { prunePushReceipts } from "../src/push-receipts";
import { makeApp, registerCafe, signUp } from "./helpers/app";
import { withPlatformConfig } from "./helpers/platform-config";
import { setupTestAuth, setupTestDb } from "./helpers/testDb";

/**
 * Pro gating + push campaigns (#24, ADR 0011): each Café has a Plan, enforced
 * server-side ONLY at the campaign boundary — the loyalty loop never reads it.
 * In v1 the Platform flips the flag by hand (direct SQL); these tests flip it
 * the same way, because that IS the admin path.
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
  // cascade also clears campaigns, push_tokens, and push_tickets.
  await db`truncate "user", "session", "account", "verification", cafes cascade`;
  await db`truncate fortunes`;
});

/** The v1 upgrade path: the Platform's hand on the flag (no billing, ADR 0011). */
async function makePro(cafeId: string): Promise<void> {
  await db`update cafes set "plan" = 'pro' where "id" = ${cafeId}`;
}

function sendCampaign(
  app: ReturnType<typeof makeApp>,
  cafeId: string,
  body: unknown,
  cookie?: string,
) {
  return app.request(`/api/cafes/${cafeId}/campaigns`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

// --- the Plan flag and the requires-Pro gate ---------------------------------------

test("a Café is born Free, and the owner's app can see the Plan", async () => {
  const app = makeApp({ db, auth });
  const owner = await signUp(app, "owner@example.com");
  await registerCafe(app, "Кавця", owner);

  const res = await app.request("/api/me", { headers: { cookie: owner } });

  expect(res.status).toBe(200);
  const me = meResponseSchema.parse(await res.json());
  expect(me.cafes[0]?.plan).toBe("free");
});

test("a Free Café's send is refused with the upgrade code — gating is server-side", async () => {
  const app = makeApp({ db, auth });
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця", owner);

  const res = await sendCampaign(app, cafeId, { message: "Приходьте!" }, owner);

  expect(res.status).toBe(403);
  expect(await res.json()).toEqual({ error: "pro_required" });
});

test("flipping the flag unlocks sending — an empty audience is a recorded zero, not an error", async () => {
  const app = makeApp({ db, auth });
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця", owner);
  await makePro(cafeId);

  const res = await sendCampaign(
    app,
    cafeId,
    { message: "Новий сезонний напій!" },
    owner,
  );

  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ recipients: 0 });
});

test("a Pro owner cannot send for a café they don't own", async () => {
  const app = makeApp({ db, auth });
  const alice = await signUp(app, "alice@example.com");
  const bob = await signUp(app, "bob@example.com");
  const aliceCafe = await registerCafe(app, "Кавця Аліси", alice);
  await makePro(aliceCafe);

  const res = await sendCampaign(app, aliceCafe, { message: "Привіт" }, bob);

  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "not_found" });
});

test("an empty message never leaves the validator", async () => {
  const app = makeApp({ db, auth });
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця", owner);
  await makePro(cafeId);

  const res = await sendCampaign(app, cafeId, { message: "   " }, owner);

  expect(res.status).toBe(400);
});

// --- the fan-out: who a campaign actually reaches -----------------------------------

/** Mid-afternoon in Kyiv summer time — the audience window is asserted against it. */
const SEND_AT = new Date("2026-07-10T12:00:00Z");

/** A provider that delivers nothing and remembers everything. */
function recordingProvider(): { provider: PushProvider; sent: PushMessage[] } {
  const sent: PushMessage[] = [];
  return {
    sent,
    provider: {
      async send(messages) {
        sent.push(...messages);
        return messages.map((_, i) => ({
          ticketId: `ticket-${sent.length}-${i}`,
        }));
      },
      async fetchReceipts() {
        return {};
      },
    },
  };
}

/**
 * Seed one Purchase (+ its membership row, as the app path would create) at a
 * controlled instant — audience recency needs backdated ledger rows, which no
 * public seam can mint.
 */
async function seedPurchase(
  cafeId: string,
  customerId: string,
  at: Date,
): Promise<void> {
  await db`
    insert into cafe_memberships ("cafe_id", "customer_user_id")
    values (${cafeId}, ${customerId}) on conflict do nothing
  `;
  await db`
    insert into purchases
      ("cafe_id", "customer_user_id", "qr_jti", "entry_source", "created_at")
    values
      (${cafeId}, ${customerId}, ${crypto.randomUUID()}, 'qr', ${at})
  `;
}

async function userIdOf(
  app: ReturnType<typeof makeApp>,
  cookie: string,
): Promise<string> {
  const res = await app.request("/api/me", { headers: { cookie } });
  const { id } = (await res.json()) as { id: string };
  return id;
}

/** Opt the customer in and register a device token — the two consents delivery needs. */
async function optInWithToken(
  app: ReturnType<typeof makeApp>,
  cookie: string,
  token: string,
  deviceId = "device-1",
): Promise<void> {
  const consentRes = await app.request("/api/me/push-consent", {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ consent: true }),
  });
  expect(consentRes.status).toBe(204);
  const tokenRes = await app.request("/api/me/push-token", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ token, deviceId }),
  });
  expect(tokenRes.status).toBe(204);
}

test("a send reaches exactly the consenting, recently-active members' active devices", async () => {
  const { provider, sent } = recordingProvider();
  const app = makeApp({
    db,
    auth,
    clock: fixedClock(SEND_AT),
    pushProvider: provider,
  });
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця", owner);
  await makePro(cafeId);
  const recent = new Date("2026-07-01T10:00:00Z");

  // Anna: recent, consented, two devices — reached on both, counted once.
  const anna = await signUp(app, "anna@example.com");
  await seedPurchase(cafeId, await userIdOf(app, anna), recent);
  await optInWithToken(app, anna, "ExponentPushToken[anna-1]", "anna-phone");
  await optInWithToken(app, anna, "ExponentPushToken[anna-2]", "anna-tablet");

  // Bohdan: recent, has a token, never consented — excluded.
  const bohdan = await signUp(app, "bohdan@example.com");
  await seedPurchase(cafeId, await userIdOf(app, bohdan), recent);
  const bohdanToken = await app.request("/api/me/push-token", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: bohdan },
    body: JSON.stringify({
      token: "ExponentPushToken[bohdan]",
      deviceId: "bohdan-phone",
    }),
  });
  expect(bohdanToken.status).toBe(204);

  // Христина: recent, consented, no device token — skipped without error.
  const khrystyna = await signUp(app, "khrystyna@example.com");
  await seedPurchase(cafeId, await userIdOf(app, khrystyna), recent);
  const khrystynaConsent = await app.request("/api/me/push-consent", {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: khrystyna },
    body: JSON.stringify({ consent: true }),
  });
  expect(khrystynaConsent.status).toBe(204);

  const res = await sendCampaign(
    app,
    cafeId,
    { message: "Новий сезонний напій!" },
    owner,
  );

  expect(res.status).toBe(201);
  // One person reached (Anna) — her two devices, nobody else's.
  expect(await res.json()).toEqual({ recipients: 1 });
  expect(sent.map((m) => m.token).sort()).toEqual([
    "ExponentPushToken[anna-1]",
    "ExponentPushToken[anna-2]",
  ]);
  expect(new Set(sent.map((m) => m.body))).toEqual(
    new Set(["Новий сезонний напій!"]),
  );
});

test("one long-ago purchase is not marketing forever: 89 Kyiv days in, 91 out", async () => {
  const { provider, sent } = recordingProvider();
  const app = makeApp({
    db,
    auth,
    clock: fixedClock(SEND_AT),
    pushProvider: provider,
  });
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця", owner);
  await makePro(cafeId);

  // Olha's last purchase is 89 Kyiv days back — inside the 90-day window.
  const olha = await signUp(app, "olha@example.com");
  await seedPurchase(
    cafeId,
    await userIdOf(app, olha),
    new Date("2026-04-12T10:00:00Z"),
  );
  await optInWithToken(app, olha, "ExponentPushToken[olha]", "olha-phone");

  // Dmytro's is 91 Kyiv days back — outside.
  const dmytro = await signUp(app, "dmytro@example.com");
  await seedPurchase(
    cafeId,
    await userIdOf(app, dmytro),
    new Date("2026-04-10T10:00:00Z"),
  );
  await optInWithToken(
    app,
    dmytro,
    "ExponentPushToken[dmytro]",
    "dmytro-phone",
  );

  const res = await sendCampaign(app, cafeId, { message: "Привіт!" }, owner);

  expect(await res.json()).toEqual({ recipients: 1 });
  expect(sent.map((m) => m.token)).toEqual(["ExponentPushToken[olha]"]);
});

test("recency is measured in KYIV days: a late-evening UTC purchase lands on the right day", async () => {
  const { provider, sent } = recordingProvider();
  const app = makeApp({
    db,
    auth,
    clock: fixedClock(SEND_AT),
    pushProvider: provider,
  });
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця", owner);
  await makePro(cafeId);

  // 2026-04-11 21:30 UTC = 2026-04-12 00:30 in Kyiv (EEST): the UTC date says
  // "91 days ago, excluded" — the Kyiv date says day 89, included.
  const yevhen = await signUp(app, "yevhen@example.com");
  await seedPurchase(
    cafeId,
    await userIdOf(app, yevhen),
    new Date("2026-04-11T21:30:00Z"),
  );
  await optInWithToken(
    app,
    yevhen,
    "ExponentPushToken[yevhen]",
    "yevhen-phone",
  );

  const res = await sendCampaign(app, cafeId, { message: "Привіт!" }, owner);

  expect(await res.json()).toEqual({ recipients: 1 });
  expect(sent.map((m) => m.token)).toEqual(["ExponentPushToken[yevhen]"]);
});

test("audiences never blend across Cafés (ADR 0001)", async () => {
  const { provider, sent } = recordingProvider();
  const app = makeApp({
    db,
    auth,
    clock: fixedClock(SEND_AT),
    pushProvider: provider,
  });
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця", owner);
  const otherCafe = await registerCafe(app, "Інша кавця", owner);
  await makePro(cafeId);

  // Maria is a fresh, consenting, tokened member — of the OTHER café.
  const maria = await signUp(app, "maria@example.com");
  await seedPurchase(
    otherCafe,
    await userIdOf(app, maria),
    new Date("2026-07-01T10:00:00Z"),
  );
  await optInWithToken(app, maria, "ExponentPushToken[maria]", "maria-phone");

  const res = await sendCampaign(app, cafeId, { message: "Привіт!" }, owner);

  expect(await res.json()).toEqual({ recipients: 0 });
  expect(sent).toEqual([]);
});

test("a refreshed device token replaces the old one — one device, one delivery", async () => {
  const { provider, sent } = recordingProvider();
  const app = makeApp({
    db,
    auth,
    clock: fixedClock(SEND_AT),
    pushProvider: provider,
  });
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця", owner);
  await makePro(cafeId);
  const ivan = await signUp(app, "ivan@example.com");
  await seedPurchase(
    cafeId,
    await userIdOf(app, ivan),
    new Date("2026-07-01T10:00:00Z"),
  );
  await optInWithToken(app, ivan, "ExponentPushToken[ivan-old]", "ivan-phone");
  // The same device comes back with a rotated token.
  await optInWithToken(app, ivan, "ExponentPushToken[ivan-new]", "ivan-phone");

  const res = await sendCampaign(app, cafeId, { message: "Привіт!" }, owner);

  expect(await res.json()).toEqual({ recipients: 1 });
  expect(sent.map((m) => m.token)).toEqual(["ExponentPushToken[ivan-new]"]);
});

// --- the pacing rule: one campaign per Café per Kyiv day -----------------------------

test("the second same-day send is stopped with a clear code; the next Kyiv day is fresh", async () => {
  const { provider } = recordingProvider();
  const app = makeApp({
    db,
    auth,
    clock: fixedClock(SEND_AT),
    pushProvider: provider,
  });
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця", owner);
  await makePro(cafeId);
  expect(
    (await sendCampaign(app, cafeId, { message: "Раз" }, owner)).status,
  ).toBe(201);

  const second = await sendCampaign(app, cafeId, { message: "Два" }, owner);
  expect(second.status).toBe(429);
  expect(await second.json()).toEqual({ error: "campaign_limit_reached" });

  // 21:01 UTC is already past Kyiv midnight — a new business day, a new send.
  const nextDay = makeApp({
    db,
    auth,
    clock: fixedClock(new Date("2026-07-10T21:01:00Z")),
    pushProvider: provider,
  });
  expect(
    (await sendCampaign(nextDay, cafeId, { message: "Три" }, owner)).status,
  ).toBe(201);
});

// --- receipt hygiene: dead devices stop receiving on their own ----------------------

/**
 * A provider whose receipts are programmable: sends mint predictable ticket
 * ids (`ticket-<token>`), and the test decides which receipts "arrive".
 */
function receiptsProvider(receipts: Record<string, PushReceipt>): {
  provider: PushProvider;
  sent: PushMessage[];
} {
  const sent: PushMessage[] = [];
  return {
    sent,
    provider: {
      async send(messages) {
        sent.push(...messages);
        return messages.map((m) => ({ ticketId: `ticket-${m.token}` }));
      },
      async fetchReceipts(ticketIds) {
        return Object.fromEntries(
          ticketIds
            .filter((id) => id in receipts)
            .map((id) => [id, receipts[id]!]),
        );
      },
    },
  };
}

test("a DeviceNotRegistered receipt deactivates the token — the next campaign skips the dead device", async () => {
  const receipts: Record<string, PushReceipt> = {
    "ticket-ExponentPushToken[alive]": { status: "ok" },
    "ticket-ExponentPushToken[gone]": {
      status: "error",
      error: "DeviceNotRegistered",
    },
  };
  const { provider, sent } = receiptsProvider(receipts);
  const app = makeApp({
    db,
    auth,
    clock: fixedClock(SEND_AT),
    pushProvider: provider,
  });
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця", owner);
  await makePro(cafeId);
  const recent = new Date("2026-07-01T10:00:00Z");
  const alive = await signUp(app, "alive@example.com");
  await seedPurchase(cafeId, await userIdOf(app, alive), recent);
  await optInWithToken(app, alive, "ExponentPushToken[alive]", "alive-phone");
  const gone = await signUp(app, "gone@example.com");
  await seedPurchase(cafeId, await userIdOf(app, gone), recent);
  await optInWithToken(app, gone, "ExponentPushToken[gone]", "gone-phone");
  expect(
    (await sendCampaign(app, cafeId, { message: "Раз" }, owner)).status,
  ).toBe(201);

  const outcome = await prunePushReceipts(db, provider);

  expect(outcome).toEqual({ resolved: 2, deactivated: 1 });
  // A second run finds a clean backlog — the script is idempotent.
  expect(await prunePushReceipts(db, provider)).toEqual({
    resolved: 0,
    deactivated: 0,
  });
  // The next Kyiv day's campaign reaches only the living device.
  sent.length = 0;
  const nextDay = makeApp({
    db,
    auth,
    clock: fixedClock(new Date("2026-07-10T21:01:00Z")),
    pushProvider: provider,
  });
  const res = await sendCampaign(nextDay, cafeId, { message: "Два" }, owner);
  expect(await res.json()).toEqual({ recipients: 1 });
  expect(sent.map((m) => m.token)).toEqual(["ExponentPushToken[alive]"]);
});

test("a receipt Expo hasn't produced yet stays pending for the next run", async () => {
  const receipts: Record<string, PushReceipt> = {};
  const { provider } = receiptsProvider(receipts);
  const app = makeApp({
    db,
    auth,
    clock: fixedClock(SEND_AT),
    pushProvider: provider,
  });
  const owner = await signUp(app, "owner@example.com");
  const cafeId = await registerCafe(app, "Кавця", owner);
  await makePro(cafeId);
  const anna = await signUp(app, "anna@example.com");
  await seedPurchase(
    cafeId,
    await userIdOf(app, anna),
    new Date("2026-07-01T10:00:00Z"),
  );
  await optInWithToken(app, anna, "ExponentPushToken[anna]", "anna-phone");
  await sendCampaign(app, cafeId, { message: "Раз" }, owner);

  // Receipts not ready: nothing resolved, nothing deactivated…
  expect(await prunePushReceipts(db, provider)).toEqual({
    resolved: 0,
    deactivated: 0,
  });

  // …and once the verdict lands, the SAME ticket resolves on the next run.
  receipts["ticket-ExponentPushToken[anna]"] = {
    status: "error",
    error: "DeviceNotRegistered",
  };
  expect(await prunePushReceipts(db, provider)).toEqual({
    resolved: 1,
    deactivated: 1,
  });
});

test("the daily cap is Platform-tunable without a deploy", async () => {
  await withPlatformConfig(db, "campaigns", { dailyLimit: 2 }, async () => {
    // Built inside the override: the app owns its config cache (#54), so it
    // must start after the write to read the tuned cap.
    const { provider } = recordingProvider();
    const app = makeApp({
      db,
      auth,
      clock: fixedClock(SEND_AT),
      pushProvider: provider,
    });
    const owner = await signUp(app, "owner@example.com");
    const cafeId = await registerCafe(app, "Кавця", owner);
    await makePro(cafeId);

    expect(
      (await sendCampaign(app, cafeId, { message: "Раз" }, owner)).status,
    ).toBe(201);
    expect(
      (await sendCampaign(app, cafeId, { message: "Два" }, owner)).status,
    ).toBe(201);
    expect(
      (await sendCampaign(app, cafeId, { message: "Три" }, owner)).status,
    ).toBe(429);
  });
});
