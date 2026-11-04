import type { Hono } from "hono";
import type { QrTokenResponse, QrTokenStatus } from "@kavtsya/shared";
import type { AppDeps } from "../app";
import { tokenEarned } from "../purchases";
import { signQrToken } from "../qr-token";
import type { AuthedEnv } from "../require-user";
import { uuidParamSchema } from "./params";

/**
 * The Customer's rotating QR token (ADR 0006, #19). The app polls
 * `/api/qr-token` (~60s) for a fresh signed token to render as a QR, and
 * `/api/qr-token/:jti` (#373) to learn that a scan has used the one on screen. Token
 * lifetime is Platform-tunable (`platform_config`), the secret is injected, and
 * the issuing clock is the app clock — the validation/consumption side lives in
 * the pure seam (`../qr-token`) and the scan slice (#20).
 */
export function registerQrTokenRoutes(
  app: Hono<AuthedEnv>,
  { db, clock, qrTokenSecret, platformConfig }: AppDeps,
): void {
  app.get("/api/qr-token", async (c) => {
    const user = c.get("user");

    const { ttlSeconds } = await platformConfig.qrToken();
    const { token, jti, expiresAt } = signQrToken(user.id, {
      clock,
      secret: qrTokenSecret,
      ttlSeconds,
    });

    const body: QrTokenResponse = {
      token,
      jti,
      expiresAt: expiresAt.toISOString(),
    };
    return c.json(body);
  });

  app.get("/api/qr-token/:jti", async (c) => {
    const user = c.get("user");

    // A malformed jti reads as unused, like one that was never issued: every
    // jti is a uuid, so it can't have earned.
    const jti = uuidParamSchema.safeParse(c.req.param("jti"));
    const body: QrTokenStatus = {
      used: jti.success && (await tokenEarned(db, user.id, jti.data)),
    };
    return c.json(body);
  });
}
