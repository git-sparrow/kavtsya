import type { Hono } from "hono";
import type { QrTokenResponse } from "@kavtsya/shared";
import type { AppDeps } from "../app";
import { signQrToken } from "../qr-token";
import type { AuthedEnv } from "../require-user";

/**
 * The Customer's rotating QR token (ADR 0006, #19). One authenticated route:
 * the app polls it (~60s) for a fresh signed token to render as a QR. Token
 * lifetime is Platform-tunable (`platform_config`), the secret is injected, and
 * the issuing clock is the app clock — the validation/consumption side lives in
 * the pure seam (`../qr-token`) and the scan slice (#20).
 */
export function registerQrTokenRoutes(
  app: Hono<AuthedEnv>,
  { clock, qrTokenSecret, platformConfig }: AppDeps,
): void {
  app.get("/api/qr-token", async (c) => {
    const user = c.get("user");

    const { ttlSeconds } = await platformConfig.qrToken();
    const { token, expiresAt } = signQrToken(user.id, {
      clock,
      secret: qrTokenSecret,
      ttlSeconds,
    });

    const body: QrTokenResponse = {
      token,
      expiresAt: expiresAt.toISOString(),
    };
    return c.json(body);
  });
}
