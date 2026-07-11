import type { Hono } from "hono";
import { expect } from "vitest";
import { cafeSchema } from "@kavtsya/shared";
import { type AppEnv, createApp } from "../../src/app";
import type { Auth } from "../../src/auth";
import { type Clock, systemClock } from "../../src/clock";
import type { Database } from "../../src/db";
import type { PushProvider } from "../../src/push";

/**
 * Driving the app over HTTP from a test (the request seam), kept apart from
 * `testDb.ts` which *provisions* the db/auth. These three helpers were copied
 * verbatim across every suite (#45); a change to the signup body or a new
 * `createApp` dep now lives in one place.
 */

/**
 * The QR-token secret most suites don't care about — any 32+ char string works
 * for routes that merely sign a token. `qr-token-route.test.ts` overrides it
 * when it needs to validate the token back.
 */
const DEFAULT_QR_TOKEN_SECRET = "test-qr-token-secret-at-least-32-chars";

/**
 * The push transport most suites don't care about: swallows sends (minting
 * ticket ids so the send path completes) and reports no receipts.
 * `campaigns.test.ts` injects a recording fake when it needs to observe.
 */
const swallowingPushProvider: PushProvider = {
  send: async (messages) =>
    messages.map((_, i) => ({ ticketId: `default-fake-${i}` })),
  fetchReceipts: async () => ({}),
};

export interface MakeAppOptions {
  db: Database;
  auth: Auth;
  /** Defaults to the real {@link systemClock}; `health.test.ts` freezes it. */
  clock?: Clock;
  /** Defaults to {@link DEFAULT_QR_TOKEN_SECRET}. */
  qrTokenSecret?: string;
  /** Defaults to {@link swallowingPushProvider}. */
  pushProvider?: PushProvider;
}

/** Build the app with test defaults; override only the dep a suite cares about. */
export function makeApp({
  db,
  auth,
  clock = systemClock,
  qrTokenSecret = DEFAULT_QR_TOKEN_SECRET,
  pushProvider = swallowingPushProvider,
}: MakeAppOptions): Hono<AppEnv> {
  return createApp({ db, clock, auth, qrTokenSecret, pushProvider });
}

/** Fold a response's Set-Cookie headers into a Cookie request header value. */
export function cookieFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

/** Sign a fresh Customer up via the HTTP seam and return their session cookie. */
export async function signUp(
  app: Hono<AppEnv>,
  email: string,
): Promise<string> {
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "hunter2-very-secret",
      name: "Test",
    }),
  });
  expect(res.status).toBe(200);
  return cookieFrom(res);
}

/**
 * Register a Café for the signed-in account and return its id. For suites that
 * need a Café as a fixture — `cafes.test.ts` tests the endpoint itself and
 * keeps its own raw-response variant.
 */
export async function registerCafe(
  app: Hono<AppEnv>,
  name: string,
  cookie: string,
): Promise<string> {
  const res = await app.request("/api/cafes", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name }),
  });
  expect(res.status).toBe(201);
  return cafeSchema.parse(await res.json()).id;
}
