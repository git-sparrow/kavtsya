import type { Hono } from "hono";
import { expect } from "vitest";
import { type AppEnv, createApp } from "../../src/app";
import type { Auth } from "../../src/auth";
import { type Clock, systemClock } from "../../src/clock";
import type { Database } from "../../src/db";

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

export interface MakeAppOptions {
  db: Database;
  auth: Auth;
  /** Defaults to the real {@link systemClock}; `health.test.ts` freezes it. */
  clock?: Clock;
  /** Defaults to {@link DEFAULT_QR_TOKEN_SECRET}. */
  qrTokenSecret?: string;
}

/** Build the app with test defaults; override only the dep a suite cares about. */
export function makeApp({
  db,
  auth,
  clock = systemClock,
  qrTokenSecret = DEFAULT_QR_TOKEN_SECRET,
}: MakeAppOptions): Hono<AppEnv> {
  return createApp({ db, clock, auth, qrTokenSecret });
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
