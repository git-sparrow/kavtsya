import type { Hono } from "hono";
import {
  pushConsentBodySchema,
  registerPushTokenBodySchema,
} from "@kavtsya/shared";
import type { AppDeps, AppEnv } from "../app";
import { registerPushToken, setPushConsent } from "../push-tokens";

/**
 * The Customer's push endpoints (#24): consent (explicit opt-in, togglable any
 * time) and per-device token registration. The client only registers a token
 * once BOTH the OS permission and the in-app consent exist; the server still
 * re-checks consent at every fan-out — these writes are plumbing, not the gate.
 */
export function registerPushRoutes(app: Hono<AppEnv>, { db }: AppDeps): void {
  app.put("/api/me/push-consent", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);

    const parsed = pushConsentBodySchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: "invalid_consent" }, 400);

    await setPushConsent(db, user.id, parsed.data.consent);
    return c.body(null, 204);
  });

  app.post("/api/me/push-token", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);

    const parsed = registerPushTokenBodySchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: "invalid_push_token" }, 400);

    await registerPushToken(
      db,
      user.id,
      parsed.data.token,
      parsed.data.deviceId,
    );
    return c.body(null, 204);
  });
}
