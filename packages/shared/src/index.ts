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
