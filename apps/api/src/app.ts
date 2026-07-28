import { Hono } from "hono";
import { isTombstoned } from "./account-deletion";
import type { Auth, AuthSession, AuthUser } from "./auth";
import type { Clock } from "./clock";
import type { Database } from "./db";
import type { PushProvider } from "./push";
import { registerAnalyticsRoutes } from "./routes/analytics";
import { registerAuthRoutes } from "./routes/auth";
import { registerCafeRoutes } from "./routes/cafes";
import { registerHealthRoute } from "./routes/health";
import { registerLoyaltyRoutes } from "./routes/loyalty";
import { registerMemberCodeRoutes } from "./routes/member-code";
import { registerPurchaseRoutes } from "./routes/purchases";
import { registerQrTokenRoutes } from "./routes/qr-token";
import { registerCampaignRoutes } from "./routes/campaigns";
import { registerPushRoutes } from "./routes/push";
import { registerRedemptionRoutes } from "./routes/redemptions";
import { registerRosterRoutes } from "./routes/roster";
import { registerShiftRoutes } from "./routes/shifts";

/**
 * Everything the app needs from the outside world. Injected (not imported as
 * singletons) so tests can supply a real test database, a frozen clock, and an
 * auth instance pointed at the test database.
 */
export interface AppDeps {
  db: Database;
  clock: Clock;
  auth: Auth;
  /** HMAC secret signing the rotating Customer QR token (ADR 0006). */
  qrTokenSecret: string;
  /** The push transport (#24) — Expo in production, a fake under test. */
  pushProvider: PushProvider;
}

/** Per-request context: the resolved session, populated by the auth middleware. */
export type AppEnv = {
  Variables: {
    user: AuthUser | null;
    session: AuthSession | null;
  };
};

export function createApp(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Resolve the session from request cookies once per request and stash it in
  // context, so any route can read the current Customer via `c.get("user")`.
  //
  // A tombstoned account (#81) is treated as unauthenticated here, once, rather
  // than by every route remembering to ask. Deletion already revokes its
  // sessions, so this should never fire — which is the point: it is the floor
  // under that revocation, and it means no request path can ever act as a
  // deleted account. The cost is one primary-key lookup per *authenticated*
  // request; anonymous traffic and a resolved-to-null session pay nothing.
  app.use("*", async (c, next) => {
    const session = await deps.auth.api.getSession({
      headers: c.req.raw.headers,
    });
    const live =
      session && !(await isTombstoned(deps.db, session.user.id))
        ? session
        : null;
    c.set("user", live?.user ?? null);
    c.set("session", live?.session ?? null);
    await next();
  });

  // Better Auth owns signup/login/logout/session under /api/auth/*.
  app.on(["POST", "GET"], "/api/auth/*", (c) => deps.auth.handler(c.req.raw));

  registerHealthRoute(app, deps);
  registerAuthRoutes(app, deps);
  registerCafeRoutes(app, deps);
  registerLoyaltyRoutes(app, deps);
  registerQrTokenRoutes(app, deps);
  registerMemberCodeRoutes(app, deps);
  registerPurchaseRoutes(app, deps);
  registerRedemptionRoutes(app, deps);
  registerShiftRoutes(app, deps);
  registerRosterRoutes(app, deps);
  registerCampaignRoutes(app, deps);
  registerAnalyticsRoutes(app, deps);
  registerPushRoutes(app, deps);
  return app;
}
