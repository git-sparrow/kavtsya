import { z } from "zod";

/**
 * Contract for the `/health` endpoint, shared by the API (which produces it)
 * and the mobile app (which validates it). This is the first link in the
 * client -> API -> DB chain the walking skeleton proves out.
 */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  db: z.literal("ok"),
  time: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

/**
 * Roles an account can hold (ADR 0003). Every account is a `customer`;
 * `cafe_owner` is unlocked by registering a Café and is derived from ownership,
 * not stored as a flag.
 */
export const roleSchema = z.enum(["customer", "cafe_owner"]);
export type Role = z.infer<typeof roleSchema>;

/**
 * Body for registering a Café (`POST /api/cafes`) — the CafeOwner signup step
 * that unlocks the `cafe_owner` role. Trimmed so leading/trailing whitespace
 * can't smuggle in an "empty" name.
 */
export const createCafeBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
});
export type CreateCafeBody = z.infer<typeof createCafeBodySchema>;

/** A registered Café as the API returns it. */
export const cafeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});
export type Cafe = z.infer<typeof cafeSchema>;

/**
 * The platform-default Reward types a Café can choose from (CONTEXT → Reward).
 * The set of types is fixed in code, but *which* of them a Café may pick is
 * gated by the platform-default set stored in `platform_config` (story 38), so
 * the Platform can retire a type without a code deploy.
 */
export const rewardTypeSchema = z.enum([
  "free_drink",
  "free_specific_drink",
  "fixed_discount",
  "percent_discount",
]);
export type RewardType = z.infer<typeof rewardTypeSchema>;

/**
 * A configured Reward. Each type carries only the params it needs: a free drink
 * needs nothing, a specific free drink needs the item name, and the two discount
 * types carry their amount (whole ₴) or percentage (1–100).
 */
export const rewardSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("free_drink") }),
  z.object({
    type: z.literal("free_specific_drink"),
    item: z.string().trim().min(1).max(80),
  }),
  z.object({
    type: z.literal("fixed_discount"),
    amountUah: z.number().int().positive().max(100000),
  }),
  z.object({
    type: z.literal("percent_discount"),
    percent: z.number().int().min(1).max(100),
  }),
]);
export type Reward = z.infer<typeof rewardSchema>;

/**
 * A Café's loyalty program (CONTEXT → Зернятко, Reward): the Зернятко threshold
 * a Customer reaches to redeem, and the chosen Reward. `reward` is null until
 * the CafeOwner picks one. The threshold defaults to 10.
 */
export const loyaltyProgramSchema = z.object({
  threshold: z.number().int().min(1).max(1000),
  reward: rewardSchema.nullable(),
});
export type LoyaltyProgram = z.infer<typeof loyaltyProgramSchema>;

/**
 * Body for `PUT /api/cafes/:id/program`. Same shape as the program itself —
 * the CafeOwner sets the threshold and (optionally) the Reward in one write.
 * The API additionally rejects a Reward whose type isn't in the current
 * platform-default set.
 */
export const updateLoyaltyProgramBodySchema = loyaltyProgramSchema;
export type UpdateLoyaltyProgramBody = z.infer<
  typeof updateLoyaltyProgramBodySchema
>;

/**
 * One entry in the platform-default Reward set, as `GET /api/reward-defaults`
 * returns it: the Reward `type` plus a human label for the CafeOwner's chooser.
 * Read from `platform_config`, so the list is Platform-tunable (story 38).
 */
export const rewardDefaultSchema = z.object({
  type: rewardTypeSchema,
  label: z.string(),
});
export type RewardDefault = z.infer<typeof rewardDefaultSchema>;

export const rewardDefaultsSchema = z.array(rewardDefaultSchema);
export type RewardDefaults = z.infer<typeof rewardDefaultsSchema>;

/**
 * Contract for `GET /api/qr-token`: the Customer's short-lived, rotating QR
 * token (ADR 0006) and the instant it expires. The app renders `token` as a QR
 * and refreshes before `expiresAt`; the CafeOwner's scanner validates it
 * server-side (the scan slice, #20).
 */
export const qrTokenResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.string().datetime(),
});
export type QrTokenResponse = z.infer<typeof qrTokenResponseSchema>;

/**
 * Platform-tunable QR-token settings, stored in `platform_config` under the
 * `qr_token` key (ADR 0006 → "Token lifetime and grace are Platform-tunable").
 * `ttlSeconds` is the token's lifetime; `graceSeconds` is the slack past expiry
 * the scanner accepts to absorb clock skew / brief signal loss.
 */
export const qrTokenConfigSchema = z.object({
  ttlSeconds: z.number().int().positive().max(3600),
  graceSeconds: z.number().int().nonnegative().max(3600),
});
export type QrTokenConfig = z.infer<typeof qrTokenConfigSchema>;

/**
 * Contract for `GET /api/me`: the account, its derived roles, and the Cafés it
 * owns. The mobile app reads `roles` to decide whether to offer CafeOwner Mode.
 */
export const meResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  roles: z.array(roleSchema),
  cafes: z.array(cafeSchema),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/**
 * Every way `POST /api/purchases` can turn down an authenticated, well-formed
 * scan, with the HTTP status each code travels under. (Auth and body-validation
 * failures stay outside the taxonomy — they signal a broken client, not a scan
 * the CafeOwner can act on.) This is the single declaration of the
 * scan-rejection taxonomy (#50): the API derives its wire responses from it and
 * the mobile scanner keys its Ukrainian copy by it, so a new rejection reason
 * (e.g. the ones #21/#22 add) is a compile error anywhere it isn't handled yet.
 */
export const scanRejectionStatuses = {
  /** The token's life (+ grace) is over — the Customer must show a fresh code. */
  expired_token: 401,
  /** Not a token we minted: tampered, truncated, or not a Kavtsya QR at all. */
  invalid_token: 401,
  /** Self-farming guard (ADR 0003): a CafeOwner scanned their own code. */
  own_cafe: 403,
  /** The Café doesn't exist or the caller doesn't own it (indistinguishable). */
  not_found: 404,
  /** Single-use guard (ADR 0006): this token already earned its Зернятко. */
  token_used: 409,
} as const;

export type ScanRejection = keyof typeof scanRejectionStatuses;

/** Narrows an error code off the wire to the scan-rejection taxonomy. */
export function isScanRejection(code: string): code is ScanRejection {
  // Own keys only — `in` would also admit `Object.prototype` names
  // ("toString", "constructor") arriving in a hostile or garbled error body.
  return Object.hasOwn(scanRejectionStatuses, code);
}

/**
 * Body for `POST /api/purchases` — the CafeOwner's scan (#20): the Café they
 * are issuing at and the Customer's scanned rotating QR token (ADR 0006).
 */
export const issuePurchaseBodySchema = z.object({
  cafeId: z.string().uuid(),
  qrToken: z.string().min(1),
});
export type IssuePurchaseBody = z.infer<typeof issuePurchaseBodySchema>;

/**
 * Contract for a successful `POST /api/purchases`: who earned the Зернятко and
 * where they now stand against the Café's program, so the scan screen can
 * confirm ("Олена — 5/10") without a second request. `balance` is derived from
 * the ledger (ADR 0010), never a stored counter.
 */
export const purchaseResultSchema = z.object({
  customerName: z.string(),
  balance: z.number().int().nonnegative(),
  threshold: z.number().int(),
  reward: rewardSchema.nullable(),
});
export type PurchaseResult = z.infer<typeof purchaseResultSchema>;

/**
 * One entry of `GET /api/me/balances` — a Café where the Customer holds
 * Зернятка, with the program context the balance is read against. Ordered most
 * recently visited first.
 */
export const cafeBalanceSchema = z.object({
  cafeId: z.string().uuid(),
  cafeName: z.string(),
  balance: z.number().int().nonnegative(),
  threshold: z.number().int(),
  reward: rewardSchema.nullable(),
});
export type CafeBalance = z.infer<typeof cafeBalanceSchema>;

export const cafeBalancesResponseSchema = z.array(cafeBalanceSchema);
export type CafeBalancesResponse = z.infer<typeof cafeBalancesResponseSchema>;
