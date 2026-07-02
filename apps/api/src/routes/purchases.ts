import type { Hono } from "hono";
import type { PurchaseResult } from "@kavtsya/shared";
import { issuePurchaseBodySchema } from "@kavtsya/shared";
import type { AppDeps, AppEnv } from "../app";
import { getQrTokenConfig } from "../platform-config";
import { issuePurchase, listBalances } from "../purchases";
import { validateQrToken } from "../qr-token";

/**
 * The CafeOwner's scan (#20): validate the Customer's rotating QR token
 * (ADR 0006) and append one Purchase to the ledger (ADR 0010). Every failure
 * gets a distinct error code so the scan screen can tell the CafeOwner exactly
 * why — a stale token reads differently from an already-used one.
 */
export function registerPurchaseRoutes(
  app: Hono<AppEnv>,
  { db, clock, qrTokenSecret }: AppDeps,
): void {
  app.post("/api/purchases", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);

    const parsed = issuePurchaseBodySchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: "invalid_purchase" }, 400);

    const { graceSeconds } = await getQrTokenConfig(db);
    const token = validateQrToken(parsed.data.qrToken, {
      clock,
      secret: qrTokenSecret,
      graceSeconds,
    });
    if (!token.valid) {
      const error =
        token.reason === "expired" ? "expired_token" : "invalid_token";
      return c.json({ error }, 401);
    }

    const outcome = await issuePurchase(db, {
      cafeId: parsed.data.cafeId,
      ownerUserId: user.id,
      customerId: token.customerId,
      jti: token.jti,
    });
    if (!outcome.ok) {
      switch (outcome.reason) {
        case "cafe_not_owned":
          return c.json({ error: "not_found" }, 404);
        case "own_cafe":
          return c.json({ error: "own_cafe" }, 403);
        case "token_used":
          return c.json({ error: "token_used" }, 409);
      }
    }

    const body: PurchaseResult = {
      customerName: outcome.customerName,
      balance: outcome.balance,
      threshold: outcome.threshold,
      reward: outcome.reward,
    };
    return c.json(body, 201);
  });

  // The Customer side of the ledger: the Cafés where they hold Зернятка.
  app.get("/api/me/balances", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);

    return c.json(await listBalances(db, user.id));
  });
}
