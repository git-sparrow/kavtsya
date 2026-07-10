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
 * Platform-tunable manual-entry settings, stored in `platform_config` under
 * the `manual_entry` key (#21, ADR 0006): how many member-code issuances one
 * Customer can receive at one Café per Kyiv day. Tunable without a deploy so a
 * pilot café with a legitimate pattern (office bulk orders) can be
 * accommodated.
 */
export const manualEntryConfigSchema = z.object({
  dailyLimit: z.number().int().positive().max(1000),
});
export type ManualEntryConfig = z.infer<typeof manualEntryConfigSchema>;

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
 * The member-code alphabet (#21): Crockford base32 — digits and uppercase
 * letters minus the look-alikes I, L, O, U, so the Customer can read the code
 * aloud and the CafeOwner can type it right on the first try. 8 characters
 * ≈ 40 bits: guessing a valid code is impractical (the rate limit isn't the
 * only defence).
 */
export const MEMBER_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Length of a member code, in alphabet characters (hyphen not counted). */
export const MEMBER_CODE_LENGTH = 8;

const memberCodePattern = new RegExp(
  `^[${MEMBER_CODE_ALPHABET}]{${MEMBER_CODE_LENGTH}}$`,
);

/**
 * Fold a typed member code into canonical form (#21): uppercase, separators
 * (hyphens/spaces) stripped, Crockford confusables mapped (O→0, I/L→1) — so
 * `k7q4-m2zx`, `K7Q4 M2ZX`, and `K7Q4M2ZX` all name the same Customer. Both
 * sides speak this: the API before lookup, the app before submitting.
 */
export function normalizeMemberCode(typed: string): string {
  return typed
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

/** Whether a normalized code is even lookup-worthy — the app's pre-submit check. */
export function isWellFormedMemberCode(normalized: string): boolean {
  return memberCodePattern.test(normalized);
}

/** A stored code as the Customer's screen shows it: grouped `XXXX-XXXX` (#21). */
export function formatMemberCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * Contract for `GET /api/me/member-code`: the Customer's stable offline
 * fallback identity (#21, ADR 0006). Minted lazily on first request, then
 * permanent; the app caches it locally so it displays with no connectivity.
 */
export const memberCodeResponseSchema = z.object({
  memberCode: z.string().regex(memberCodePattern),
});
export type MemberCodeResponse = z.infer<typeof memberCodeResponseSchema>;

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
  /** Scanner ≠ scanned (ADR 0013): the issuing user scanned their OWN code — owner and barista alike. */
  self_scan: 403,
  /** Self-farming guard (ADR 0003): the scanned Customer owns this Café — they earn nothing here, whoever scans. */
  own_cafe: 403,
  /** The Café doesn't exist or the caller doesn't own it (indistinguishable). */
  not_found: 404,
  /** Single-use guard (ADR 0006): this token already earned its Зернятко. */
  token_used: 409,
  /** No Customer holds this member code — ask them to re-read it (#21). */
  unknown_member_code: 404,
  /** The Customer's manual issuances at this Café hit today's ceiling (#21). */
  manual_limit_reached: 429,
} as const;

export type ScanRejection = keyof typeof scanRejectionStatuses;

/** Narrows an error code off the wire to the scan-rejection taxonomy. */
export function isScanRejection(code: string): code is ScanRejection {
  // Own keys only — `in` would also admit `Object.prototype` names
  // ("toString", "constructor") arriving in a hostile or garbled error body.
  return Object.hasOwn(scanRejectionStatuses, code);
}

/**
 * Body for `POST /api/purchases` — one issuance seam, two ways to identify the
 * Customer (#21, ADR 0006): the Café plus *either* the scanned rotating QR
 * token (#20) *or* the typed member code — the offline fallback when the QR
 * can't be scanned. Same ledger, same guards, same success contract.
 */
export const issuePurchaseBodySchema = z.union([
  z.object({
    cafeId: z.string().uuid(),
    qrToken: z.string().min(1),
  }),
  z.object({
    cafeId: z.string().uuid(),
    memberCode: z.string().min(1),
  }),
]);
export type IssuePurchaseBody = z.infer<typeof issuePurchaseBodySchema>;

/**
 * Contract for a successful `POST /api/purchases`: who earned the Зернятко and
 * where they now stand against the Café's program, so the scan screen can
 * confirm ("Олена — 5/10") without a second request. `balance` is derived from
 * the ledger (ADR 0010), never a stored counter. `customerId` is what makes
 * Redemption "off the same single scan" (#22, ADR 0006): the one scan
 * identified the Customer, so the confirm references them without a new token.
 */
export const purchaseResultSchema = z.object({
  customerId: z.string(),
  customerName: z.string(),
  balance: z.number().int().nonnegative(),
  threshold: z.number().int(),
  reward: rewardSchema.nullable(),
  /**
   * The Customer's Ворожка for this Purchase (#23, ADR 0009): drawn from the
   * day's pre-generated pool (never a live AI call on the scan), with a
   * built-in fallback — so it is always present, even when the daily job
   * failed. Displayed on the Customer's side after the scan.
   */
  fortune: z.string().min(1),
});
export type PurchaseResult = z.infer<typeof purchaseResultSchema>;

/**
 * Every way `POST /api/redemptions` can turn down an authenticated, well-formed
 * confirm, with the HTTP status each code travels under — the same single-
 * declaration taxonomy pattern as the scan (#50), so the CafeOwner screen's
 * Ukrainian copy is a compile error to leave incomplete.
 */
export const redemptionRejectionStatuses = {
  /** Self-farming guard (ADR 0003): Redemption is also rejected at one's own Café. */
  own_cafe: 403,
  /** The Café doesn't exist or the caller doesn't own it (indistinguishable). */
  not_found: 404,
  /** The Customer's balance is below the Café's current threshold. */
  insufficient_balance: 409,
  /** The Café has no Reward configured — there is nothing to claim. */
  no_reward: 409,
} as const;

export type RedemptionRejection = keyof typeof redemptionRejectionStatuses;

/** Narrows an error code off the wire to the redemption-rejection taxonomy. */
export function isRedemptionRejection(
  code: string,
): code is RedemptionRejection {
  return Object.hasOwn(redemptionRejectionStatuses, code);
}

/**
 * Body for `POST /api/redemptions` — the CafeOwner confirms a Redemption as a
 * distinct action off the one scan (#22): `customerId` comes from the scan's
 * `PurchaseResult`, and `idempotencyKey` is minted per confirm tap so a flaky
 * retry replays instead of double-spending, while an intentional second
 * confirm (banking) carries a fresh key.
 */
export const confirmRedemptionBodySchema = z.object({
  cafeId: z.string().uuid(),
  customerId: z.string().min(1),
  idempotencyKey: z.string().min(1).max(200),
});
export type ConfirmRedemptionBody = z.infer<typeof confirmRedemptionBodySchema>;

/**
 * Contract for a confirmed `POST /api/redemptions`: the Customer's new derived
 * balance, and the `beansSpent` + `reward` the Redemption snapshotted at
 * confirm time (ADR 0010) — later program changes never re-price it.
 */
export const redemptionResultSchema = z.object({
  balance: z.number().int().nonnegative(),
  beansSpent: z.number().int().positive(),
  reward: rewardSchema,
});
export type RedemptionResult = z.infer<typeof redemptionResultSchema>;

/**
 * Body for `POST /api/cafes/:id/shift-invites` — the CafeOwner opens a shift
 * («Зміна», #80, ADR 0013). By default the grant runs to the end of the café's
 * business day (next Europe/Kyiv midnight); an explicit `durationMinutes` cuts
 * it shorter (a trial barista's two-hour window) and is clamped to that same
 * midnight — a shift never outlives the business day.
 */
export const openShiftInviteBodySchema = z.object({
  durationMinutes: z.number().int().min(5).max(1440).optional(),
});
export type OpenShiftInviteBody = z.infer<typeof openShiftInviteBodySchema>;

/**
 * Contract for a minted shift invite (#80): the signed token the owner's
 * screen renders as a QR, and the short code fallback — same 8-char Crockford
 * format as the member code (#21), so the entry affordance is shared. The
 * invite is single-use and dies at `inviteExpiresAt` (~10 min); the grant an
 * accept mints lives until `grantExpiresAt`.
 */
export const shiftInviteResponseSchema = z.object({
  inviteToken: z.string().min(1),
  inviteCode: z.string().regex(memberCodePattern),
  inviteExpiresAt: z.string().datetime(),
  grantExpiresAt: z.string().datetime(),
});
export type ShiftInviteResponse = z.infer<typeof shiftInviteResponseSchema>;

/**
 * Body for `POST /api/shift-invites/accept` — the barista's side of the
 * handshake (#80): *either* the invite token their camera scanned *or* the
 * short code they typed, mirroring the scan/member-code split of
 * `issuePurchaseBodySchema`. Same invite, same grant either way.
 */
export const acceptShiftInviteBodySchema = z.union([
  z.object({ inviteToken: z.string().min(1) }),
  z.object({ inviteCode: z.string().min(1) }),
]);
export type AcceptShiftInviteBody = z.infer<typeof acceptShiftInviteBodySchema>;

/**
 * Contract for an accepted invite (#80): the shift the barista's app now
 * carries — which Café the scanner mode is scoped to, and when the grant
 * self-expires. The persistent shift banner renders from exactly this.
 */
export const acceptShiftInviteResultSchema = z.object({
  cafeId: z.string().uuid(),
  cafeName: z.string(),
  expiresAt: z.string().datetime(),
});
export type AcceptShiftInviteResult = z.infer<
  typeof acceptShiftInviteResultSchema
>;

/**
 * Every way `POST /api/shift-invites/accept` can turn down an authenticated,
 * well-formed accept — the same single-declaration taxonomy pattern as the
 * scan (#50), so the barista-side Ukrainian copy is compile-checked complete.
 */
export const shiftInviteRejectionStatuses = {
  /** Not an invite we minted: tampered, foreign, malformed — or an unknown typed code. */
  invalid_invite: 401,
  /** The invite's ten minutes are over — the owner mints a fresh one in one tap. */
  expired_invite: 401,
  /** One invite admits one barista (#80): this one already did. «Запросити ще». */
  invite_used: 409,
} as const;

export type ShiftInviteRejection = keyof typeof shiftInviteRejectionStatuses;

/** Narrows an error code off the wire to the invite-rejection taxonomy. */
export function isShiftInviteRejection(
  code: string,
): code is ShiftInviteRejection {
  return Object.hasOwn(shiftInviteRejectionStatuses, code);
}

/**
 * One entry of `GET /api/cafes/:id/shifts` — an active shift on the owner's
 * board (#80): who is behind the counter and when their grant self-expires.
 * `id` is what `DELETE /api/cafes/:id/shifts/:grantId` revokes.
 */
export const shiftGrantSchema = z.object({
  id: z.string().uuid(),
  baristaName: z.string(),
  expiresAt: z.string().datetime(),
});
export type ShiftGrant = z.infer<typeof shiftGrantSchema>;

export const shiftsResponseSchema = z.array(shiftGrantSchema);
export type ShiftsResponse = z.infer<typeof shiftsResponseSchema>;

/**
 * Contract for `GET /api/me/shift` — the barista side (#80): the active shift
 * this account holds (the scanner mode's scope + the banner's expiry), or null
 * when it lapsed or was revoked. Same shape the accept handed back, so the app
 * renders both from one type.
 */
export const myShiftResponseSchema = z.object({
  shift: acceptShiftInviteResultSchema.nullable(),
});
export type MyShiftResponse = z.infer<typeof myShiftResponseSchema>;

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
