import type { Hono } from "hono";
import type { QrTokenResponse, QrTokenStatus } from "@kavtsya/shared";
import type { AppDeps } from "../app";
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

    // Scoped to the caller's own Purchases, so someone else's jti reads as
    // unused — the same answer as a jti that was never issued. A malformed one
    // gets that answer too (every jti is a uuid).
    const jti = uuidParamSchema.safeParse(c.req.param("jti"));
    const [row] = jti.success
      ? await db<{ used: boolean }[]>`
          select exists (
            select 1 from purchases
            where "qr_jti" = ${jti.data} and "customer_user_id" = ${user.id}
          ) as used
        `
      : [];

    const body: QrTokenStatus = { used: row?.used ?? false };
    return c.json(body);
  });
}
