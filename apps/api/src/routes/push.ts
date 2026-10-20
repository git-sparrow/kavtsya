import type { Hono } from "hono";
import {
  pushConsentBodySchema,
  registerPushTokenBodySchema,
  releasePushTokenBodySchema,
} from "@kavtsya/shared";
import type { AppDeps } from "../app";
import {
  registerPushToken,
  releasePushToken,
  setPushConsent,
} from "../push-tokens";
import type { AuthedEnv } from "../require-user";

/**
 * The Customer's push endpoints (#24): consent (explicit opt-in, togglable any
 * time), per-device token registration, and its release on sign-out (#330).
 * The client registers whenever the OS allows pushes, consent or not, because
 * operational pushes (#97) aren't marketing; the server checks consent at every
 * campaign fan-out — these writes are plumbing, not the gate.
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

  app.post("/api/me/push-token/release", async (c) => {
    const user = c.get("user");

    const parsed = releasePushTokenBodySchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: "invalid_device" }, 400);

    await releasePushToken(db, {
      userId: user.id,
      deviceId: parsed.data.deviceId,
    });
    return c.body(null, 204);
  });
}
