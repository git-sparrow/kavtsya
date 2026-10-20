import type { Hono } from "hono";
import {
  DEVICE_ID_HEADER,
  deviceIdSchema,
  pushConsentBodySchema,
  registerPushTokenBodySchema,
} from "@kavtsya/shared";
import type { AppDeps, AppEnv } from "../app";
import {
  registerPushToken,
  releasePushToken,
  setPushConsent,
} from "../push-tokens";
import type { AuthedEnv } from "../require-user";

/**
 * The Customer's push endpoints (#24): consent (explicit opt-in, togglable any
 * time) and per-device token registration. Registration doesn't need consent,
 * because operational pushes (#97) aren't marketing; the server checks consent
 * at every campaign fan-out — these writes are plumbing, not the gate.
 */
export function registerPushRoutes(
  app: Hono<AuthedEnv>,
  { db }: AppDeps,
): void {
  app.put("/api/me/push-consent", async (c) => {
    const user = c.get("user");

    const parsed = pushConsentBodySchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: "invalid_consent" }, 400);

    await setPushConsent(db, user.id, parsed.data.consent);
    return c.body(null, 204);
  });

  app.post("/api/me/push-token", async (c) => {
    const user = c.get("user");

    const parsed = registerPushTokenBodySchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: "invalid_push_token" }, 400);

    await registerPushToken(db, {
      userId: user.id,
      token: parsed.data.token,
      deviceId: parsed.data.deviceId,
    });
    return c.body(null, 204);
  });
}

/**
 * Sign-out stops this device's pushes for the account signing out (#330). The
 * app names its device in {@link DEVICE_ID_HEADER}; once Better Auth has ended
 * the session, the release runs as that session's own user, so no client value
 * can reach another account's tokens. A registration from that session that
 * arrives afterwards no longer authenticates; one already past authentication
 * can still write in the milliseconds around it. Without a release (offline,
 * expired session, no header, an older build) the token stays active until
 * another account registers on the device. The maintainer accepted both
 * residuals on 2026-10-20 (PR #350).
 *
 * Registered before the `/api/auth/*` handler, which it wraps.
 */
export function registerSignOutRelease(
  app: Hono<AppEnv>,
  { auth, db }: AppDeps,
): void {
  app.post("/api/auth/sign-out", async (c) => {
    const signedOut = c.get("resolvedSession");
    const response = await auth.handler(c.req.raw);
    const deviceId = deviceIdSchema.safeParse(c.req.header(DEVICE_ID_HEADER));
    if (response.ok && signedOut && deviceId.success) {
      await releasePushToken(db, {
        userId: signedOut.user.id,
        deviceId: deviceId.data,
      });
    }
    return response;
  });
}
