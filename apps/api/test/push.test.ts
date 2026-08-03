import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { meResponseSchema } from "@kavtsya/shared";
import type { Auth } from "../src/auth";
import type { Database } from "../src/db";
import { makeApp, signUp } from "./helpers/app";
import { setupTestAuth, setupTestDb } from "./helpers/testDb";

/**
 * Push infrastructure — Customer side (#24): the explicit café-news consent
 * (default OFF, changeable any time) and the per-device token registration.
 * Both are Customer plumbing that predates any Pro café existing; the campaign
 * fan-out (campaigns.test.ts) is where their effect on delivery is observed.
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
  // cascade also clears push_tickets (it references push_tokens).
  await db`truncate fortunes, push_tokens cascade`;
});

function putConsent(
  app: ReturnType<typeof makeApp>,
  consent: unknown,
  cookie?: string,
) {
  return app.request("/api/me/push-consent", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ consent }),
  });
}

function registerToken(
  app: ReturnType<typeof makeApp>,
  body: unknown,
  cookie?: string,
) {
  return app.request("/api/me/push-token", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function myConsent(
  app: ReturnType<typeof makeApp>,
  cookie: string,
): Promise<boolean> {
  const res = await app.request("/api/me", { headers: { cookie } });
  expect(res.status).toBe(200);
  return meResponseSchema.parse(await res.json()).pushConsent;
}

// --- consent: explicit opt-in, default OFF -----------------------------------------

test("café news is something the Customer chooses: consent starts OFF", async () => {
  const app = makeApp({ db, auth });
  const customer = await signUp(app, "customer@example.com");

  expect(await myConsent(app, customer)).toBe(false);
});

test("the settings toggle round-trips: on, then off again", async () => {
  const app = makeApp({ db, auth });
  const customer = await signUp(app, "customer@example.com");

  expect((await putConsent(app, true, customer)).status).toBe(204);
  expect(await myConsent(app, customer)).toBe(true);

  expect((await putConsent(app, false, customer)).status).toBe(204);
  expect(await myConsent(app, customer)).toBe(false);
});

test("a consent change must carry a boolean", async () => {
  const app = makeApp({ db, auth });
  const customer = await signUp(app, "customer@example.com");

  expect((await putConsent(app, "yes", customer)).status).toBe(400);
});

// --- token registration: per device, idempotent -------------------------------------

test("a device registers its push token, and re-registering is idempotent", async () => {
  const app = makeApp({ db, auth });
  const customer = await signUp(app, "customer@example.com");
  const body = { token: "ExponentPushToken[abc123]", deviceId: "device-1" };

  expect((await registerToken(app, body, customer)).status).toBe(204);
  expect((await registerToken(app, body, customer)).status).toBe(204);
});

test("token registration requires a well-formed body", async () => {
  const app = makeApp({ db, auth });
  const customer = await signUp(app, "customer@example.com");

  expect((await registerToken(app, { token: "" }, customer)).status).toBe(400);
});
