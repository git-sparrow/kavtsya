import type { Hono } from "hono";
import { updateLoyaltyProgramBodySchema } from "@kavtsya/shared";
import type { AppDeps } from "../app";
import {
  getLoyaltyProgram,
  getRewardDefaults,
  rewardTypeIsOffered,
  updateLoyaltyProgram,
} from "../loyalty";
import type { AuthedEnv } from "../require-user";
import { uuidParamSchema } from "./params";

/**
 * Loyalty program config for CafeOwner Mode (#18): the platform-default Reward
 * set plus per-Café read/write of the threshold and chosen Reward. Every route
 * requires a session; the program routes additionally require ownership of the
 * Café (enforced by the ownership-scoped queries in `../loyalty`).
 */
export function registerLoyaltyRoutes(
  app: Hono<AuthedEnv>,
  { db }: AppDeps,
): void {
  // The platform-default Reward set the CafeOwner's chooser renders (story 38).
  app.get("/api/reward-defaults", async (c) => {
    return c.json(await getRewardDefaults(db));
  });

  app.get("/api/cafes/:id/program", async (c) => {
    const user = c.get("user");

    const cafeId = uuidParamSchema.safeParse(c.req.param("id"));
    if (!cafeId.success) return c.json({ error: "not_found" }, 404);

    const program = await getLoyaltyProgram(db, cafeId.data, user.id);
    if (!program) return c.json({ error: "not_found" }, 404);
    return c.json(program);
  });

  app.put("/api/cafes/:id/program", async (c) => {
    const user = c.get("user");

    const cafeId = uuidParamSchema.safeParse(c.req.param("id"));
    if (!cafeId.success) return c.json({ error: "not_found" }, 404);

    const parsed = updateLoyaltyProgramBodySchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: "invalid_program" }, 400);

    // A chosen Reward must be one the platform currently offers (story 38).
    if (parsed.data.reward) {
      const defaults = await getRewardDefaults(db);
      if (!rewardTypeIsOffered(parsed.data.reward, defaults)) {
        return c.json({ error: "reward_not_offered" }, 400);
      }
    }

    const program = await updateLoyaltyProgram(
      db,
      cafeId.data,
      user.id,
      parsed.data,
    );
    if (!program) return c.json({ error: "not_found" }, 404);
    return c.json(program);
  });
}
