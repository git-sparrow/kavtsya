import type { Hono } from "hono";
import { createCafeBodySchema } from "@kavtsya/shared";
import type { AppDeps } from "../app";
import { createCafe } from "../cafes";
import type { AuthedEnv } from "../require-user";

/**
 * Café registration — the CafeOwner signup step (ADR 0003). Registering a Café
 * is what unlocks the `cafe_owner` role for an already-authenticated account,
 * so this is the "one combined flow": no separate role-grant call.
 */
export function registerCafeRoutes(
  app: Hono<AuthedEnv>,
  { db }: AppDeps,
): void {
  app.post("/api/cafes", async (c) => {
    const user = c.get("user");

    const parsed = createCafeBodySchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: "invalid_cafe" }, 400);

    const cafe = await createCafe(db, user.id, parsed.data.name);
    return c.json(cafe, 201);
  });
}
