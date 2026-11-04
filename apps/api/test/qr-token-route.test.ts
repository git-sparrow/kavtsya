import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import {
  meResponseSchema,
  qrTokenResponseSchema,
  qrTokenStatusSchema,
} from "@kavtsya/shared";
import type { Auth } from "../src/auth";
import { systemClock } from "../src/clock";
import type { Database } from "../src/db";
import { validateQrToken } from "../src/qr-token";
import { makeApp, registerCafe, signUp } from "./helpers/app";
import { withoutPlatformConfig } from "./helpers/platform-config";
import { setupTestAuth, setupTestDb } from "./helpers/testDb";

const QR_SECRET = "qr-route-test-secret-at-least-32-chars-long";

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

function app() {
  return makeApp({ db, auth, qrTokenSecret: QR_SECRET });
}

test("an authed Customer gets a signed token that validates back to them", async () => {
  const cookie = await signUp(app(), "customer@example.com");

  const res = await app().request("/api/qr-token", { headers: { cookie } });

  expect(res.status).toBe(200);
  const { token, jti, expiresAt } = qrTokenResponseSchema.parse(
    await res.json(),
  );

  // The token validates server-side (the scanner's check, ADR 0006) and resolves
  // to this Customer's id — the seam the scan slice (#20) will consume.
  const me = meResponseSchema.parse(
    await (await app().request("/api/me", { headers: { cookie } })).json(),
  );
  const result = validateQrToken(token, {
    clock: systemClock,
    secret: QR_SECRET,
    graceSeconds: 30,
  });
  expect(result).toEqual({ valid: true, customerId: me.id, jti });

  // Seeded config is a 90s lifetime, so expiry is comfortably in the future.
  expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
});

test("a missing qr_token config row degrades to defaults instead of failing", async () => {
  const cookie = await signUp(app(), "customer@example.com");

  // A DB where migration 0005 hasn't seeded qr_token yet. `app()` builds a
  // fresh app — and so a cold config cache — per request, so the missing row
  // is observed without anyone resetting anything (#54).
  await withoutPlatformConfig(db, "qr_token", async () => {
    const res = await app().request("/api/qr-token", { headers: { cookie } });

    // Still issues a usable token (fallback ttl/grace), not a 500.
    expect(res.status).toBe(200);
    const { token } = qrTokenResponseSchema.parse(await res.json());
    const result = validateQrToken(token, {
      clock: systemClock,
      secret: QR_SECRET,
      graceSeconds: 30,
    });
    expect(result.valid).toBe(true);
  });
});

// --- has the shown token been used? (#373) -----------------------------------

async function freshToken(cookie: string) {
  const res = await app().request("/api/qr-token", { headers: { cookie } });
  return qrTokenResponseSchema.parse(await res.json());
}

async function statusOf(jti: string, cookie: string) {
  const res = await app().request(`/api/qr-token/${jti}`, {
    headers: { cookie },
  });
  expect(res.status).toBe(200);
  return qrTokenStatusSchema.parse(await res.json());
}

function scan(cafeId: string, qrToken: string, cookie: string) {
  return app().request("/api/purchases", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ cafeId, qrToken }),
  });
}

test("the token the Customer is showing reads as used once a scan earns on it", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe(app(), "Кавця на Подолі", owner);
  const customer = await signUp(app(), "customer@example.com");
  const { token, jti } = await freshToken(customer);

  expect(await statusOf(jti, customer)).toEqual({ used: false });

  expect((await scan(cafeId, token, owner)).status).toBe(201);

  expect(await statusOf(jti, customer)).toEqual({ used: true });
});

test("another user's used token reads as unused, like any token that isn't theirs", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe(app(), "Кавця на Подолі", owner);
  const customer = await signUp(app(), "customer@example.com");
  const stranger = await signUp(app(), "stranger@example.com");
  const { token, jti } = await freshToken(customer);
  expect((await scan(cafeId, token, owner)).status).toBe(201);

  expect(await statusOf(jti, stranger)).toEqual({ used: false });
});

test("a malformed token id reads as unused rather than failing", async () => {
  const customer = await signUp(app(), "customer@example.com");

  expect(await statusOf("not-a-uuid", customer)).toEqual({ used: false });
});

test("the status check needs a signed-in user", async () => {
  const res = await app().request(`/api/qr-token/${crypto.randomUUID()}`);

  expect(res.status).toBe(401);
});
