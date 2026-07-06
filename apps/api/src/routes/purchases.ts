import type { Context, Hono } from "hono";
import type { PurchaseResult, ScanRejection } from "@kavtsya/shared";
import {
  issuePurchaseBodySchema,
  scanRejectionStatuses,
} from "@kavtsya/shared";
import type { AppDeps, AppEnv } from "../app";
import { getQrTokenConfig } from "../platform-config";
import type { IssuePurchaseRejection } from "../purchases";
import { issuePurchase, listBalances } from "../purchases";
import type { QrTokenInvalidReason } from "../qr-token";
import { validateQrToken } from "../qr-token";

/**
 * The CafeOwner's scan (#20): validate the Customer's rotating QR token
 * (ADR 0006) and append one Purchase to the ledger (ADR 0010). Every failure
 * gets a distinct error code so the scan screen can tell the CafeOwner exactly
 * why — a stale token reads differently from an already-used one.
 */

/**
 * How each domain reason travels the wire (#50): the only place a reason picks
 * its `ScanRejection` code — the status comes with the code from the shared
 * taxonomy. Both `malformed` and `bad_signature` read as `invalid_token`: the
 * CafeOwner can't act on the difference, and naming a bad signature would only
 * help someone probing tokens.
 */
const wireCodes: Record<
  QrTokenInvalidReason | IssuePurchaseRejection,
  ScanRejection
> = {
  expired: "expired_token",
  malformed: "invalid_token",
  bad_signature: "invalid_token",
  cafe_not_owned: "not_found",
  own_cafe: "own_cafe",
  token_used: "token_used",
};

/** The lookup lives inside, so no call site can skip the reason→code mapping. */
function reject(
  c: Context<AppEnv>,
  reason: QrTokenInvalidReason | IssuePurchaseRejection,
) {
  const code = wireCodes[reason];
  return c.json({ error: code }, scanRejectionStatuses[code]);
}

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
    if (!token.valid) return reject(c, token.reason);

    const outcome = await issuePurchase(db, {
      cafeId: parsed.data.cafeId,
      ownerUserId: user.id,
      customerId: token.customerId,
      jti: token.jti,
    });
    if (!outcome.ok) return reject(c, outcome.reason);

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
