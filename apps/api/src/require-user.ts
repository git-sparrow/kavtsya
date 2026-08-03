import type { MiddlewareHandler } from "hono";
import { except } from "hono/combine";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "./app";
import type { AuthSession, AuthUser } from "./auth";

/**
 * The protected-route guard (#51). Authentication used to be eight — then
 * twenty-two — copies of the same `if (!user) return 401` at the top of every
 * handler. One missed copy on a future route is a silent authorization hole,
 * and no compiler catches a check that simply is not there.
 *
 * So the guard moved to the app-composition seam and inverted: it runs on
 * everything, and the *public* surface is the short list that names itself
 * (see `PUBLIC_PATHS` in `app.ts`). A route added tomorrow is protected before
 * anyone thinks about it; a public one forgotten on the list answers 401 —
 * loudly wrong, never quietly open.
 */

/**
 * The request context downstream of {@link requireUser}: the session is no
 * longer a maybe. Handlers registered on a `Hono<AuthedEnv>` read
 * `c.get("user")` as a plain {@link AuthUser} — no null check to forget, no
 * cast, no `!`. It extends {@link AppEnv} rather than replacing it so the
 * narrowed view stays assignable to the app it is a view of.
 */
export type AuthedEnv = {
  Variables: AppEnv["Variables"] & {
    user: AuthUser;
    session: AuthSession;
  };
};

/** The 401 body an unauthenticated request gets — the only 401 the guard sends. */
const unauthorized = { error: "unauthorized" } as const;

/**
 * Turn the resolved-or-null session into the guaranteed one, or answer 401.
 * Nothing downstream — body parsing included — runs for an anonymous caller.
 */
const guard = createMiddleware<AuthedEnv>(async (c, next) => {
  const resolved = c.get("resolvedSession");
  if (!resolved) return c.json(unauthorized, 401);

  c.set("user", resolved.user);
  c.set("session", resolved.session);
  await next();
});

/**
 * The guard, with an explicit public allow-list carved out of it. Mount it at
 * `*` and **before every route it covers, public ones included** — Hono runs a
 * path's handlers in registration order, so a route registered ahead of the
 * guard answers without ever reaching it and silently opts itself out.
 *
 * Mounted correctly it sits ahead of routing, so an unmatched path answers 401
 * to an anonymous caller rather than 404 — the surface does not enumerate
 * itself to strangers.
 *
 * @param publicPaths path patterns that need no session (Hono route syntax,
 *   so `/api/auth/*` opens the whole Better Auth subtree).
 */
export function requireUser(
  publicPaths: readonly string[],
): MiddlewareHandler<AuthedEnv> {
  // `except` is declared over a loose `MiddlewareHandler`, which erases the env
  // it wraps. The return type above restates it — and it is exactly what
  // `guard` is typed to deliver, so nothing is being claimed that isn't proven
  // a few lines up.
  return except([...publicPaths], guard);
}
