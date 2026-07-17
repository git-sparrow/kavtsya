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

/**
 * A Café's Plan (#24, ADR 0011 — per-Café pricing, CONTEXT → Plan). Default
 * `free`; in v1 only the Platform's hand flips it (billing deferred). Read at
 * exactly one server boundary — the requires-Pro guard — never in the loyalty
 * loop.
 */
export const planSchema = z.enum(["free", "pro"]);
export type Plan = z.infer<typeof planSchema>;

/** A registered Café as the API returns it. `plan` drives the mobile Pro section. */
export const cafeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  plan: planSchema,
});
export type Cafe = z.infer<typeof cafeSchema>;

/**
 * A Café as its owner sees it on the café home (`/api/me`): the Café plus the
 * single free teaser stat (#25, ADR 0011) — how many Customers came back in the
 * last 30 Kyiv days. It rides on the owner's existing café data for Free and Pro
 * alike (one cheap aggregate, no separate endpoint, no gating), and equals the
 * `repeatCustomers` an analytics read reports for the same 30-day window. The
 * fence (ADR 0011): this is the ONE permanent free stat — any further free-tier
 * number requires amending that ADR, not citing this precedent.
 */
export const ownerCafeSchema = cafeSchema.extend({
  returningCustomers30d: z.number().int().nonnegative(),
});
export type OwnerCafe = z.infer<typeof ownerCafeSchema>;

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
 * Platform-tunable campaign pacing (#24), stored in `platform_config` under
 * the `campaigns` key: how many campaigns one Café may send per Kyiv day.
 * Tunable without a deploy so a legitimate special case (a café's anniversary
 * week) can be accommodated — same pattern as the manual-entry ceiling.
 */
export const campaignConfigSchema = z.object({
  dailyLimit: z.number().int().positive().max(100),
});
export type CampaignConfig = z.infer<typeof campaignConfigSchema>;

/**
 * Contract for `GET /api/me`: the account, its derived roles, and the Cafés it
 * owns. The mobile app reads `roles` to decide whether to offer CafeOwner Mode.
 */
export const meResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  roles: z.array(roleSchema),
  cafes: z.array(ownerCafeSchema),
  /** Café-news consent (#24): explicit opt-in, default false — the settings toggle reads this. */
  pushConsent: z.boolean(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/**
 * Body for `PUT /api/me/push-consent` (#24): the Customer's explicit café-news
 * opt-in — asked in-app after their first earned Зернятко, togglable any time.
 * Checked server-side at every fan-out; off means excluded, whatever tokens exist.
 */
export const pushConsentBodySchema = z.object({
  consent: z.boolean(),
});
export type PushConsentBody = z.infer<typeof pushConsentBodySchema>;

/**
 * Body for `POST /api/me/push-token` (#24): register/refresh THIS device's
 * Expo push token. Per device, not per account — `deviceId` is an opaque
 * stable device identity the app supplies.
 */
export const registerPushTokenBodySchema = z.object({
  token: z.string().min(1).max(400),
  deviceId: z.string().min(1).max(200),
});
export type RegisterPushTokenBody = z.infer<typeof registerPushTokenBodySchema>;

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
 * A shift the barista's app carries (#98, ADR 0013): which Café the near-kiosk
 * Scanner Mode is scoped to, and when the grant self-expires (a rolling ~16h
 * cap, #99). One poster scan starts it and `GET /api/me/shift` reads it back, so
 * the banner renders from a single type.
 */
export const shiftSchema = z.object({
  cafeId: z.string().uuid(),
  cafeName: z.string(),
  expiresAt: z.string().datetime(),
});
export type Shift = z.infer<typeof shiftSchema>;

/**
 * Body for `POST /api/poster-scans` (#98, ADR 0013): the barista (or the owner)
 * presents a Café's non-secret wall poster code — same 8-char Crockford base32
 * shape + normalization as the member code (#21), normalized server-side, so a
 * sloppily typed code still resolves. `confirmSwitch` is the second step of the
 * one-active-shift switch (#99): a scan that meets an active shift at another
 * Café comes back `switch_required`; re-sending it with `confirmSwitch: true`
 * ends that shift and starts this one.
 */
export const posterScanBodySchema = z.object({
  posterCode: z.string().min(1),
  confirmSwitch: z.boolean().optional(),
});
export type PosterScanBody = z.infer<typeof posterScanBodySchema>;

/**
 * Contract for `POST /api/poster-scans` (#98, #99). Security rests on the
 * roster, not the poster (ADR 0013): a non-rostered scan only ever raises a
 * `pending` request that grants nothing. A rostered barista starts a shift —
 * `shift_started` carries the live shift — unless one already runs at another
 * Café, in which case `switch_required` names both Cafés and awaits
 * `confirmSwitch`. The owner scanning their OWN poster gets `owner_cafe`: the
 * poster is the staff's affordance, and the owner already scans Customers from
 * CafeOwner Mode — so a self-scan starts nothing, it just says "this is yours".
 * A discriminated union so the app's handling is compile-checked exhaustive.
 */
export const posterScanResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending"), cafeName: z.string() }),
  z.object({ status: z.literal("shift_started"), shift: shiftSchema }),
  z.object({
    status: z.literal("switch_required"),
    cafeName: z.string(),
    currentCafeName: z.string(),
  }),
  z.object({ status: z.literal("owner_cafe"), cafeName: z.string() }),
]);
export type PosterScanResult = z.infer<typeof posterScanResultSchema>;

/**
 * One entry of `GET /api/cafes/:id/shifts` — an active shift on the owner's
 * board: who is behind the counter and when their grant self-expires. `id` is
 * what `DELETE /api/cafes/:id/shifts/:grantId` revokes.
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
 * Contract for `GET /api/me/shift` — the barista side: the active shift this
 * account holds (Scanner Mode's scope + the banner's expiry), or null once it
 * lapsed, was revoked, or the barista was removed from the roster (#99). Same
 * shape a poster scan hands back, so the app renders both from one type.
 */
export const myShiftResponseSchema = z.object({
  shift: shiftSchema.nullable(),
});
export type MyShiftResponse = z.infer<typeof myShiftResponseSchema>;

/** One pending join request on the owner's Roster board — awaiting approval. */
export const rosterPendingEntrySchema = z.object({
  userId: z.string(),
  name: z.string(),
  requestedAt: z.string().datetime(),
});
export type RosterPendingEntry = z.infer<typeof rosterPendingEntrySchema>;

/** One rostered barista on the owner's Roster board — approved, removable. */
export const rosterMemberEntrySchema = z.object({
  userId: z.string(),
  name: z.string(),
  approvedAt: z.string().datetime(),
});
export type RosterMemberEntry = z.infer<typeof rosterMemberEntrySchema>;

/**
 * Contract for `GET /api/cafes/:id/roster` (#97): the CafeOwner's Roster board —
 * the Café's printable poster code, plus the pending requests (badge source)
 * and the rostered baristas. Approve moves an account from `pending` to
 * `rostered`; remove drops it back to none.
 */
export const rosterBoardResponseSchema = z.object({
  posterCode: z.string(),
  pending: z.array(rosterPendingEntrySchema),
  rostered: z.array(rosterMemberEntrySchema),
});
export type RosterBoardResponse = z.infer<typeof rosterBoardResponseSchema>;

/**
 * Body for `POST /api/cafes/:id/campaigns` (#24): the short push message a
 * Pro CafeOwner sends to their Café's recently-active, consenting Customers.
 * Trimmed and capped — push notifications truncate long text anyway.
 */
export const sendCampaignBodySchema = z.object({
  message: z.string().trim().min(1).max(200),
});
export type SendCampaignBody = z.infer<typeof sendCampaignBodySchema>;

/**
 * Contract for a sent campaign (#24): the result summary the owner sees —
 * how many recipients the send actually reached (consenting, recently-active
 * members with live tokens).
 */
export const campaignResultSchema = z.object({
  recipients: z.number().int().nonnegative(),
});
export type CampaignResult = z.infer<typeof campaignResultSchema>;

/**
 * Every way `POST /api/cafes/:id/campaigns` can turn down an authenticated,
 * well-formed send — the same single-declaration taxonomy pattern as the scan
 * (#50), so the campaigns screen's Ukrainian copy is compile-checked complete.
 * `pro_required` is THE Plan-gate code (#24): #25's analytics reuses it.
 */
export const campaignRejectionStatuses = {
  /** The Café doesn't exist or the caller doesn't own it (indistinguishable). */
  not_found: 404,
  /** The Café is on Free — the campaign section is the upgrade pitch (ADR 0011). */
  pro_required: 403,
  /** Today's campaign already went out — 1 per Café per Kyiv day (Platform-tunable). */
  campaign_limit_reached: 429,
} as const;

export type CampaignRejection = keyof typeof campaignRejectionStatuses;

/** Narrows an error code off the wire to the campaign-rejection taxonomy. */
export function isCampaignRejection(code: string): code is CampaignRejection {
  return Object.hasOwn(campaignRejectionStatuses, code);
}

/**
 * The period an analytics read covers (#25): the last 7 or 30 *Kyiv* days,
 * today inclusive. Presets only — no custom ranges (ratified 2026-07-10);
 * `30d` is the default the screen opens on. The query string carries it, so a
 * missing/unknown value falls back to `30d` server-side.
 */
export const analyticsPeriodSchema = z.enum(["7d", "30d"]);
export type AnalyticsPeriod = z.infer<typeof analyticsPeriodSchema>;

/**
 * The number of Kyiv hours in a day — the peak-hours histogram has exactly one
 * bucket per hour (index = Kyiv hour of day, 0–23), so a chart can render it
 * without knowing which hours had traffic.
 */
export const HOURS_IN_DAY = 24;

/**
 * Contract for `GET /api/cafes/:id/analytics` (#25, ADR 0011) — the Pro-gated
 * summary a CafeOwner reads for one Café, derived live from the Purchase ledger
 * (ADR 0010). `hourly[h]` is the number of Зернятка earned in Kyiv hour `h`
 * over the period (DST-correct), so the buckets always sum to the period's total
 * Purchases. `newCustomers`/`repeatCustomers` split the **Active Customers**
 * (distinct Customers with ≥1 Purchase at this Café in the period): *new* first
 * ever visited inside the period, *repeat* had a Purchase here before it, and
 * `newCustomers + repeatCustomers === activeCustomers` always. Active Customer
 * is analytics-only — it never gates billing or anything else (#25).
 */
export const analyticsSummarySchema = z.object({
  period: analyticsPeriodSchema,
  hourly: z.array(z.number().int().nonnegative()).length(HOURS_IN_DAY),
  activeCustomers: z.number().int().nonnegative(),
  newCustomers: z.number().int().nonnegative(),
  repeatCustomers: z.number().int().nonnegative(),
});
export type AnalyticsSummary = z.infer<typeof analyticsSummarySchema>;

/**
 * Every way `GET /api/cafes/:id/analytics` can turn down an authenticated
 * request — the same single-declaration taxonomy pattern as the scan (#50) and
 * campaign gates, so the analytics screen's Ukrainian copy is compile-checked
 * complete. Gating reuses #24's `pro_required` code and status: analytics adds
 * no new gate mechanism (#25).
 */
export const analyticsRejectionStatuses = {
  /** The Café doesn't exist or the caller doesn't own it (indistinguishable). */
  not_found: 404,
  /** The Café is on Free — analytics is the same upgrade pitch (ADR 0011). */
  pro_required: 403,
} as const;

export type AnalyticsRejection = keyof typeof analyticsRejectionStatuses;

/** Narrows an error code off the wire to the analytics-rejection taxonomy. */
export function isAnalyticsRejection(code: string): code is AnalyticsRejection {
  return Object.hasOwn(analyticsRejectionStatuses, code);
}

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
