import type { Hono } from "hono";
import type { MeResponse } from "@kavtsya/shared";
import type { AppDeps, AppEnv } from "../app";
import { listCafesByOwner, rolesFor } from "../cafes";

/**
 * App-owned routes that depend on an authenticated session. Better Auth's own
 * endpoints live under /api/auth/*; this is where our domain reads the session.
 */
export function registerAuthRoutes(app: Hono<AppEnv>, { db }: AppDeps): void {
  // The account foundation every later slice builds on: who am I? Returns 401
  // when no valid session cookie is present. `roles`/`cafes` let the mobile app
  // decide whether to offer CafeOwner Mode (ADR 0003).
  app.get("/api/me", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);

    const cafes = await listCafesByOwner(db, user.id);
    const body: MeResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: rolesFor(cafes),
      cafes,
    };
    return c.json(body);
  });
}
