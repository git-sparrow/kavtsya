import type { Hono } from "hono";
import type { RedemptionRejection, RedemptionResult } from "@kavtsya/shared";
import {
  confirmRedemptionBodySchema,
  redemptionRejectionStatuses,
} from "@kavtsya/shared";
import type { AppDeps, AppEnv } from "../app";
import type { ConfirmRedemptionRejection } from "../redemptions";
import { confirmRedemption } from "../redemptions";

/**
 * The CafeOwner's Redemption confirm (#22): a distinct action off the one scan
 * (ADR 0006 — no second token), appending an immutable `redemptions` row that
 * snapshots the spend. A replayed idempotency key answers 200 with the stored
 * outcome; only a fresh confirm is a 201.
 */

/** The one place a domain reason picks its wire code, as the scan does (#50). */
const wireCodes: Record<ConfirmRedemptionRejection, RedemptionRejection> = {
  cafe_not_owned: "not_found",
  own_cafe: "own_cafe",
  insufficient_balance: "insufficient_balance",
  no_reward: "no_reward",
};

export function registerRedemptionRoutes(
  app: Hono<AppEnv>,
  { db, clock }: AppDeps,
): void {
  app.post("/api/redemptions", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);

    const parsed = confirmRedemptionBodySchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: "invalid_redemption" }, 400);

    const outcome = await confirmRedemption(db, {
      cafeId: parsed.data.cafeId,
      actorUserId: user.id,
      customerId: parsed.data.customerId,
      idempotencyKey: parsed.data.idempotencyKey,
      now: clock.now(),
    });
    if (!outcome.ok) {
      const code = wireCodes[outcome.reason];
      return c.json({ error: code }, redemptionRejectionStatuses[code]);
    }

    const body: RedemptionResult = {
      balance: outcome.balance,
      beansSpent: outcome.beansSpent,
      reward: outcome.reward,
    };
    return c.json(body, outcome.replayed ? 200 : 201);
  });
}
