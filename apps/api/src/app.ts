import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { isTombstoned } from "./account-deletion";
import type { Auth, AuthSession, AuthUser } from "./auth";
import type { Clock } from "./clock";
import type { Database } from "./db";
import type { PlatformConfig } from "./platform-config";
import type { PushProvider } from "./push";
import { requireUser } from "./require-user";
import { registerAnalyticsRoutes } from "./routes/analytics";
import { registerCafeRoutes } from "./routes/cafes";
import { registerFortuneRoutes } from "./routes/fortunes";
import { registerHealthRoute } from "./routes/health";
import { registerLoyaltyRoutes } from "./routes/loyalty";
import { registerMeRoutes } from "./routes/me";
import { registerMemberCodeRoutes } from "./routes/member-code";
import { registerPurchaseRoutes } from "./routes/purchases";
import { registerQrTokenRoutes } from "./routes/qr-token";
import { registerCampaignRoutes } from "./routes/campaigns";
import { registerPushRoutes, registerSignOutRelease } from "./routes/push";
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
  /**
   * The Platform-config reader (#54). Injected rather than imported so its read
   * cache belongs to this app instance: one in production, a fresh one per test
   * app, which is what keeps suites from leaking config into each other.
   */
  platformConfig: PlatformConfig;
}

/** A live session: who is calling, and the session row backing them. */
export interface ResolvedSession {
  user: AuthUser;
  session: AuthSession;
}

/**
 * Per-request context before the guard: the session lookup, which is null for
 * an anonymous request. `requireUser` reads it — everything past that point
 * sees the guaranteed `user`/`session` of `AuthedEnv` (#51) — and so does the
 * public sign-out route, to know whose device it is releasing (#330).
 */
export type AppEnv = {
  Variables: {
    resolvedSession: ResolvedSession | null;
  };
};

/**
 * The public surface: every other path needs a session (#51). Default-deny, so
 * this list — not each handler's memory — is what decides. Health is the
 * uptime probe; `/api/auth/*` is Better Auth's own signup/login, which by
 * definition runs before anyone has a session.
 */
const PUBLIC_PATHS = ["/health", "/api/auth/*"] as const;

function containsNul(value: unknown): boolean {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const item = pending.pop();
    if (typeof item === "string" && item.includes("\u0000")) return true;
    if (item !== null && typeof item === "object") {
      for (const [key, nested] of Object.entries(item)) {
        if (key.includes("\u0000")) return true;
        pending.push(nested);
      }
    }
  }
  return false;
}

// PostgreSQL text cannot represent NUL in decoded JSON or form fields.
function rejectNul(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const mediaType = c.req
      .header("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    const payload = c.req.raw.body
      ? mediaType === "application/x-www-form-urlencoded"
        ? [...new URLSearchParams(await c.req.raw.clone().text())]
        : await c.req.raw
            .clone()
            .json()
            .catch(() => null)
      : null;
    if (/%00/i.test(c.req.url) || containsNul(payload)) {
      return c.json({ error: "invalid_request" }, 400);
    }
    await next();
  };
}

export function createApp(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use("*", secureHeaders());

  // Resolve the session from request cookies once per request and stash it in
  // context. Resolving is all this does — whether a route *requires* one is the
  // next middleware's job.
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
    c.set("resolvedSession", live);
    await next();
  });

  // The one guard (#51), mounted BEFORE every route it covers — including the
  // public ones. That ordering is what makes `PUBLIC_PATHS` load-bearing: a
  // route registered ahead of the guard would answer without ever consulting
  // it, and the allow-list would quietly become decoration. Past this line the
  // session is guaranteed in the types as well as at runtime — `authed` is the
  // same app seen as `Hono<AuthedEnv>`, so every handler registered on it reads
  // a non-null `user` and none carries, or can forget, its own check.
  const authed = app.use("*", requireUser(PUBLIC_PATHS));

  app.use(
    "*",
    bodyLimit({
      maxSize: 64 * 1024,
      onError: (c) => c.json({ error: "invalid_request" }, 413),
    }),
  );
  app.use("*", rejectNul());

  // The public surface, named in PUBLIC_PATHS above. Better Auth owns
  // signup/login/logout/session under /api/auth/*; sign-out is wrapped first
  // so it also releases the device's push token (#330).
  registerSignOutRelease(app, deps);
  app.on(["POST", "GET"], "/api/auth/*", (c) => deps.auth.handler(c.req.raw));
  registerHealthRoute(app, deps);

  registerMeRoutes(authed, deps);
  registerCafeRoutes(authed, deps);
  registerLoyaltyRoutes(authed, deps);
  registerQrTokenRoutes(authed, deps);
  registerMemberCodeRoutes(authed, deps);
  registerPurchaseRoutes(authed, deps);
  registerFortuneRoutes(authed, deps);
  registerRedemptionRoutes(authed, deps);
  registerShiftRoutes(authed, deps);
  registerRosterRoutes(authed, deps);
  registerCampaignRoutes(authed, deps);
  registerAnalyticsRoutes(authed, deps);
  registerPushRoutes(authed, deps);
  return app;
}
