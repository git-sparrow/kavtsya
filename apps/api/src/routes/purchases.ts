import type { Context, Hono } from "hono";
import type { PurchaseResult, ScanRejection } from "@kavtsya/shared";
import {
  issuePurchaseBodySchema,
  scanRejectionStatuses,
} from "@kavtsya/shared";
import type { AppDeps, AppEnv } from "../app";
import { kyivDayOf } from "../clock";
import { fortuneForScan } from "../fortunes";
import { customerIdForMemberCode } from "../member-code";
import { getManualEntryConfig, getQrTokenConfig } from "../platform-config";
import type { IssuePurchaseRejection, PurchaseEntry } from "../purchases";
import { issuePurchase, listBalances } from "../purchases";
import type { QrTokenInvalidReason } from "../qr-token";
import { validateQrToken } from "../qr-token";

/**
 * The CafeOwner's scan (#20): validate the Customer's rotating QR token
 * (ADR 0006) and append one Purchase to the ledger (ADR 0010). Every failure
 * gets a distinct error code so the scan screen can tell the CafeOwner exactly
 * why — a stale token reads differently from an already-used one.
 *
 * The same endpoint is the offline fallback (#21): a body carrying the typed
 * `memberCode` instead of `qrToken` identifies the Customer by their stable
 * code — then issuing proceeds identically.
 */

/** Why identifying the Customer by member code failed (#21) — route-level, like the token reasons. */
type MemberCodeInvalidReason = "unknown_member_code";

/**
 * How each domain reason travels the wire (#50): the only place a reason picks
 * its `ScanRejection` code — the status comes with the code from the shared
 * taxonomy. Both `malformed` and `bad_signature` read as `invalid_token`: the
 * CafeOwner can't act on the difference, and naming a bad signature would only
 * help someone probing tokens.
 */
const wireCodes: Record<
  QrTokenInvalidReason | MemberCodeInvalidReason | IssuePurchaseRejection,
  ScanRejection
> = {
  expired: "expired_token",
  malformed: "invalid_token",
  bad_signature: "invalid_token",
  unknown_member_code: "unknown_member_code",
  cafe_not_owned: "not_found",
  self_scan: "self_scan",
  own_cafe: "own_cafe",
  token_used: "token_used",
  manual_limit_reached: "manual_limit_reached",
};

/** The lookup lives inside, so no call site can skip the reason→code mapping. */
function reject(
  c: Context<AppEnv>,
  reason:
    | QrTokenInvalidReason
    | MemberCodeInvalidReason
    | IssuePurchaseRejection,
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

    // Identify the Customer by whichever identifier the body carries (#21):
    // the rotating QR token or the typed member code.
    let identity: { customerId: string; entry: PurchaseEntry };
    if ("qrToken" in parsed.data) {
      const { graceSeconds } = await getQrTokenConfig(db);
      const token = validateQrToken(parsed.data.qrToken, {
        clock,
        secret: qrTokenSecret,
        graceSeconds,
      });
      if (!token.valid) return reject(c, token.reason);
      identity = {
        customerId: token.customerId,
        entry: { source: "qr", jti: token.jti },
      };
    } else {
      const customerId = await customerIdForMemberCode(
        db,
        parsed.data.memberCode,
      );
      if (!customerId) return reject(c, "unknown_member_code");
      const { dailyLimit } = await getManualEntryConfig(db);
      identity = {
        customerId,
        entry: {
          source: "member_code",
          dailyLimit,
          kyivDay: kyivDayOf(clock.now()),
        },
      };
    }

    const outcome = await issuePurchase(db, {
      cafeId: parsed.data.cafeId,
      issuedByUserId: user.id,
      now: clock.now(),
      ...identity,
    });
    if (!outcome.ok) return reject(c, outcome.reason);

    const body: PurchaseResult = {
      customerId: outcome.customerId,
      customerName: outcome.customerName,
      balance: outcome.balance,
      threshold: outcome.threshold,
      reward: outcome.reward,
      // A cheap pool read (ADR 0009) — the Зернятко above is already issued,
      // and no model is ever called from the scan path.
      fortune: await fortuneForScan(db, clock),
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
