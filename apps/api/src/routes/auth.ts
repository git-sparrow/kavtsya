import type { Hono } from "hono";
import type { AppEnv } from "../app";

/**
 * App-owned routes that depend on an authenticated session. Better Auth's own
 * endpoints live under /api/auth/*; this is where our domain reads the session.
 */
export function registerAuthRoutes(app: Hono<AppEnv>): void {
  // The account foundation every later slice builds on: who am I? Returns 401
  // when no valid session cookie is present.
  app.get("/api/me", (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    return c.json({ id: user.id, email: user.email, name: user.name });
  });
}
