import { Hono } from "hono";
import type { Auth, AuthSession, AuthUser } from "./auth";
import type { Clock } from "./clock";
import type { Database } from "./db";
import { registerAuthRoutes } from "./routes/auth";
import { registerCafeRoutes } from "./routes/cafes";
import { registerHealthRoute } from "./routes/health";
import { registerLoyaltyRoutes } from "./routes/loyalty";

/**
 * Everything the app needs from the outside world. Injected (not imported as
 * singletons) so tests can supply a real test database, a frozen clock, and an
 * auth instance pointed at the test database.
 */
export interface AppDeps {
  db: Database;
  clock: Clock;
  auth: Auth;
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
  app.use("*", async (c, next) => {
    const session = await deps.auth.api.getSession({
      headers: c.req.raw.headers,
    });
    c.set("user", session?.user ?? null);
    c.set("session", session?.session ?? null);
    await next();
  });

  // Better Auth owns signup/login/logout/session under /api/auth/*.
  app.on(["POST", "GET"], "/api/auth/*", (c) => deps.auth.handler(c.req.raw));

  registerHealthRoute(app, deps);
  registerAuthRoutes(app, deps);
  registerCafeRoutes(app, deps);
  registerLoyaltyRoutes(app, deps);
  return app;
}
