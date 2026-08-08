import {
  type AnalyticsPeriod,
  type AnalyticsRejection,
  type AnalyticsSummary,
  analyticsSummarySchema,
  type Cafe,
  type CafeBalancesResponse,
  cafeBalancesResponseSchema,
  cafeSchema,
  type CampaignRejection,
  type CampaignResult,
  campaignResultSchema,
  type DeletionPreview,
  deletionPreviewSchema,
  isAnalyticsRejection,
  isCampaignRejection,
  isRedemptionRejection,
  isScanRejection,
  type LoyaltyProgram,
  loyaltyProgramSchema,
  memberCodeResponseSchema,
  type MeResponse,
  meResponseSchema,
  type MyShiftResponse,
  myShiftResponseSchema,
  type PendingFortuneResponse,
  pendingFortuneResponseSchema,
  type PosterScanResult,
  posterScanResultSchema,
  type PurchaseResult,
  purchaseResultSchema,
  type QrTokenResponse,
  qrTokenResponseSchema,
  type RedemptionRejection,
  type RedemptionResult,
  redemptionResultSchema,
  type RewardDefaults,
  rewardDefaultsSchema,
  type RosterBoardResponse,
  rosterBoardResponseSchema,
  type ScanRejection,
  type ShiftsResponse,
  shiftsResponseSchema,
} from "@kavtsya/shared";

import { apiFetch } from "@/lib/auth-client";

// Calls to our own API go through the Better Auth client's fetch (via apiFetch),
// so the Expo plugin attaches the SecureStore-held session cookie automatically.
// Responses are validated against the shared schemas — the same type-safe
// boundary the API enforces on the way out.
//
// Every endpoint below is a thin, typed declaration over the one `request`
// helper: which path, which shared schema, and what to say when it fails. The
// fetch/throw/parse mechanics live in `request` alone (#53), so an endpoint
// cannot forget to check the error or skip validation.

/**
 * Validates one endpoint's response body. Structurally a Zod schema — declared
 * as the one method we call, so this module needs no direct dependency on zod
 * (mobile only has it transitively, through the shared package).
 */
type Parser<T> = { parse: (data: unknown) => T };

/**
 * For endpoints whose response body carries nothing worth reading: the call
 * either succeeds or throws, and there is nothing to validate in between.
 */
const NO_BODY: Parser<void> = { parse: () => undefined };

/**
 * Turns a rejection code the API returned into the error this endpoint should
 * throw for it, or `undefined` for a code the endpoint doesn't name (which then
 * falls through to its fallback message).
 */
type RejectionMapper = (code: string) => Error | undefined;

type RequestOptions = {
  method?: string;
  body?: unknown;
  /** Thrown when the call fails and no named rejection matched. */
  fallback: string;
  /** The rejections this endpoint distinguishes, if any. */
  rejections?: RejectionMapper;
};

/**
 * The one way this app talks to its API: send, fail loudly with a message a
 * screen can show, or return a body validated against the shared schema. Every
 * exported endpoint function is a call to this.
 */
async function request<T>(
  path: string,
  schema: Parser<T>,
  { method, body, fallback, rejections }: RequestOptions,
): Promise<T> {
  // Only the keys that are actually set — better-fetch reads the absence of
  // `method`/`body` (a plain GET), not an explicit `undefined`.
  const wire: { method?: string; body?: unknown } = {};
  if (method) wire.method = method;
  if (body !== undefined) wire.body = body;

  const { data, error } = await apiFetch(path, wire);
  if (error) throw toError(error, fallback, rejections);
  return schema.parse(data);
}

/**
 * The error an endpoint throws for a failed call. Our API's failure bodies are
 * `{ error: "<code>" }`; better-fetch folds the parsed body into the error
 * object, so a rejection code sits on `error.error` beside its own `message`.
 */
function toError(
  error: { message?: string },
  fallback: string,
  rejections?: RejectionMapper,
): Error {
  const code = (error as { error?: string }).error;
  const named = code ? rejections?.(code) : undefined;
  return named ?? new Error(error.message ?? fallback);
}

/**
 * Names the rejections one endpoint distinguishes: a guard from the shared
 * taxonomy plus this app's copy for every code in it. The `Record` is
 * exhaustive, so a rejection code added to the taxonomy is a compile error here
 * until it has screen copy — never a silent fallback message.
 */
function mapRejections<C extends string>(
  isCode: (code: string) => code is C,
  copy: Record<C, string>,
): RejectionMapper {
  return (code) => (isCode(code) ? new Error(copy[code]) : undefined);
}

export async function fetchMe(): Promise<MeResponse> {
  return request("/api/me", meResponseSchema, {
    fallback: "Не вдалося завантажити профіль",
  });
}

export async function registerCafe(name: string): Promise<Cafe> {
  return request("/api/cafes", cafeSchema, {
    method: "POST",
    body: { name },
    fallback: "Не вдалося зареєструвати кав'ярню",
  });
}

/**
 * The Customer's rotating QR token (ADR 0006). The app renders `token` as a QR
 * and refetches before `expiresAt` so the code on screen is always fresh.
 */
export async function fetchQrToken(): Promise<QrTokenResponse> {
  return request("/api/qr-token", qrTokenResponseSchema, {
    fallback: "Не вдалося оновити QR-код",
  });
}

/** The platform-default Reward set the config screen offers (story 38). */
export async function fetchRewardDefaults(): Promise<RewardDefaults> {
  return request("/api/reward-defaults", rewardDefaultsSchema, {
    fallback: "Не вдалося завантажити винагороди",
  });
}

export async function fetchProgram(cafeId: string): Promise<LoyaltyProgram> {
  return request(`/api/cafes/${cafeId}/program`, loyaltyProgramSchema, {
    fallback: "Не вдалося завантажити програму",
  });
}

/**
 * A rejected scan the API could name against the #50 taxonomy. Carries the
 * `code` so the scanner can key its two-line recovery copy (2f) by it, while
 * `message` stays a plain single-line fallback for logs and non-taxonomy paths.
 */
export class ScanRejectionError extends Error {
  constructor(readonly code: ScanRejection) {
    super(SCAN_REJECTIONS[code]);
    this.name = "ScanRejectionError";
  }
}

/**
 * What the scanner tells the CafeOwner for each rejection the API
 * distinguishes (#20). Keyed by the shared taxonomy (#50), so a rejection code
 * added there without copy here is a type error, not a fallback message.
 */
const SCAN_REJECTIONS: Record<ScanRejection, string> = {
  token_used: "Цей код уже використано — попросіть клієнта показати новий",
  expired_token: "Код протермінувався — попросіть клієнта показати новий",
  invalid_token: "Це не QR-код Кавці",
  self_scan: "Власний код сканувати не можна",
  own_cafe: "У власній кав'ярні зернятка не нараховуються",
  not_found: "Кав'ярню не знайдено",
  unknown_member_code:
    "Такого коду немає — попросіть клієнта перевірити код у застосунку",
  manual_limit_reached:
    "Денний ліміт ручних нарахувань для цього клієнта вичерпано",
};

/**
 * One issuance seam, two identifiers (#21): the scanned rotating QR token or
 * the typed member code — the same request, ledger effects, and result either
 * way. Only the wire body differs, so both public functions share this.
 *
 * A named rejection arrives as a typed `ScanRejectionError` rather than a plain
 * message, because the scanner keys its recovery copy off the code itself.
 */
async function requestPurchase(
  body: { cafeId: string } & ({ qrToken: string } | { memberCode: string }),
): Promise<PurchaseResult> {
  return request("/api/purchases", purchaseResultSchema, {
    method: "POST",
    body,
    fallback: "Не вдалося нарахувати зернятко",
    rejections: (code) =>
      isScanRejection(code) ? new ScanRejectionError(code) : undefined,
  });
}

/**
 * The CafeOwner's scan (#20): send the scanned rotating QR token and get back
 * who earned the Зернятко and their new derived balance.
 */
export function issuePurchase(
  cafeId: string,
  qrToken: string,
): Promise<PurchaseResult> {
  return requestPurchase({ cafeId, qrToken });
}

/**
 * The offline fallback (#21): the CafeOwner types the Customer's member code
 * when the QR can't be scanned. The caller normalizes before submitting.
 */
export function issuePurchaseByMemberCode(
  cafeId: string,
  memberCode: string,
): Promise<PurchaseResult> {
  return requestPurchase({ cafeId, memberCode });
}

/**
 * The Customer's stable member code (#21): fetched once, then cached on the
 * device (see `useMemberCode`) so it displays with no connectivity at all.
 */
export async function fetchMemberCode(): Promise<string> {
  const { memberCode } = await request(
    "/api/me/member-code",
    memberCodeResponseSchema,
    { fallback: "Не вдалося отримати код" },
  );
  return memberCode;
}

/**
 * What the confirm screen tells the CafeOwner for each rejection the API
 * distinguishes (#22) — same compile-checked pattern as the scan copy above.
 */
const REDEMPTION_REJECTIONS: Record<RedemptionRejection, string> = {
  insufficient_balance: "Недостатньо зернят для винагороди",
  no_reward: "Спершу оберіть винагороду в налаштуваннях програми",
  own_cafe: "У власній кав'ярні винагороди не видаються",
  not_found: "Кав'ярню не знайдено",
};

/**
 * The CafeOwner confirms a Redemption (#22) — a distinct action off the one
 * scan (ADR 0006): `customerId` comes from the scan result, no second token.
 * The server subtracts the Café's threshold and snapshots the spend; the same
 * `idempotencyKey` retried replays that outcome instead of spending twice.
 */
export async function confirmRedemption(
  cafeId: string,
  customerId: string,
  idempotencyKey: string,
): Promise<RedemptionResult> {
  return request("/api/redemptions", redemptionResultSchema, {
    method: "POST",
    body: { cafeId, customerId, idempotencyKey },
    fallback: "Не вдалося видати винагороду",
    rejections: mapRejections(isRedemptionRejection, REDEMPTION_REJECTIONS),
  });
}

/** The owner's shift board (#98): who is behind the counter right now. */
export async function fetchShifts(cafeId: string): Promise<ShiftsResponse> {
  return request(`/api/cafes/${cafeId}/shifts`, shiftsResponseSchema, {
    fallback: "Не вдалося завантажити зміни",
  });
}

/** Revocation is a tap (#99): the shift ends now instead of at its ~16h cap. */
export async function revokeShift(
  cafeId: string,
  grantId: string,
): Promise<void> {
  return request(`/api/cafes/${cafeId}/shifts/${grantId}`, NO_BODY, {
    method: "DELETE",
    fallback: "Не вдалося завершити зміну",
  });
}

/**
 * The barista ends their own shift (#96, ADR 0015): «Завершити зміну» revokes
 * the grant server-side so the app re-derives out of the near-kiosk Scanner
 * Mode. Idempotent on the server — a no-op when nothing is active.
 */
export async function endMyShift(): Promise<void> {
  return request("/api/me/shift", NO_BODY, {
    method: "DELETE",
    fallback: "Не вдалося завершити зміну",
  });
}

/** The barista's side (#98): the active shift this account holds, or null. */
export async function fetchMyShift(): Promise<MyShiftResponse["shift"]> {
  const { shift } = await request("/api/me/shift", myShiftResponseSchema, {
    fallback: "Не вдалося перевірити зміну",
  });
  return shift;
}

/** The Cafés where the Customer holds Зернятка (most recently visited first). */
export async function fetchBalances(): Promise<CafeBalancesResponse> {
  return request("/api/me/balances", cafeBalancesResponseSchema, {
    fallback: "Не вдалося завантажити зернятка",
  });
}

/**
 * What deleting the account would cost (#81): every Café balance that dies, and
 * every Café that would close. Read BEFORE the confirm dialog opens, so the
 * question the Customer answers names its own consequences instead of asking
 * them to remember. A pure read — fetching it commits to nothing.
 */
export async function fetchDeletionPreview(): Promise<DeletionPreview> {
  return request("/api/me/deletion-preview", deletionPreviewSchema, {
    fallback: "Не вдалося перевірити, що буде видалено",
  });
}

/**
 * Delete the account (#81, ADR 0014) — permanent and immediate, with no grace
 * period and nothing anyone can restore. The server tombstones the account and
 * archives any Café it owns; the caller then signs the app out, because the
 * session this request travelled on no longer exists.
 */
export async function deleteAccount(): Promise<void> {
  return request("/api/me", NO_BODY, {
    method: "DELETE",
    fallback: "Не вдалося видалити акаунт",
  });
}

/**
 * The Customer's pending Ворожка reveal (#23), or null when there is none. The
 * home polls this while foregrounded so the reveal appears shortly after the
 * CafeOwner scans.
 */
export async function fetchPendingFortune(): Promise<PendingFortuneResponse> {
  return request("/api/me/fortune/pending", pendingFortuneResponseSchema, {
    fallback: "Не вдалося завантажити ворожку",
  });
}

/** Mark a Ворожка reveal seen (the «Дякую» tap) so it isn't shown again. */
export async function markFortuneSeen(id: string): Promise<void> {
  return request(`/api/me/fortune/${id}/seen`, NO_BODY, {
    method: "POST",
    fallback: "Не вдалося оновити ворожку",
  });
}

/**
 * What the campaigns screen tells the CafeOwner for each rejection the API
 * distinguishes (#24) — same compile-checked pattern as the scan copy above.
 */
const CAMPAIGN_REJECTIONS: Record<CampaignRejection, string> = {
  not_found: "Кав'ярню не знайдено",
  pro_required: "Розсилки доступні на тарифі Pro",
  campaign_limit_reached:
    "Сьогоднішню розсилку вже надіслано — наступна можлива завтра",
};

/**
 * The Pro CafeOwner sends a push campaign (#24): one short message to the
 * Café's recently-active Customers who opted in to café news. Returns how
 * many people it reached.
 */
export async function sendCampaign(
  cafeId: string,
  message: string,
): Promise<CampaignResult> {
  return request(`/api/cafes/${cafeId}/campaigns`, campaignResultSchema, {
    method: "POST",
    body: { message },
    fallback: "Не вдалося надіслати розсилку",
    rejections: mapRejections(isCampaignRejection, CAMPAIGN_REJECTIONS),
  });
}

/**
 * What the analytics screen tells the CafeOwner for each rejection the API
 * distinguishes (#25) — same compile-checked pattern as the campaign copy. Both
 * codes drive UI, not just an error line: `pro_required` renders the Pro pitch,
 * `not_found` a plain café-missing message.
 */
const ANALYTICS_REJECTIONS: Record<AnalyticsRejection, string> = {
  not_found: "Кав'ярню не знайдено",
  pro_required: "Аналітика доступна на тарифі Pro",
};

/**
 * The Pro CafeOwner's analytics for one Café (#25): peak hours + repeat-vs-new
 * over the chosen 7d/30d window, derived live from the ledger. A Free café
 * comes back `pro_required` — the screen renders that as the upgrade pitch,
 * so the thrown message is only the fallback for an unexpected error.
 */
export async function fetchAnalytics(
  cafeId: string,
  period: AnalyticsPeriod,
): Promise<AnalyticsSummary> {
  return request(
    `/api/cafes/${cafeId}/analytics?period=${period}`,
    analyticsSummarySchema,
    {
      fallback: "Не вдалося завантажити аналітику",
      rejections: mapRejections(isAnalyticsRejection, ANALYTICS_REJECTIONS),
    },
  );
}

/** The Customer's explicit café-news opt-in (#24): flip it on the server. */
export async function updatePushConsent(consent: boolean): Promise<void> {
  return request("/api/me/push-consent", NO_BODY, {
    method: "PUT",
    body: { consent },
    fallback: "Не вдалося зберегти вибір",
  });
}

/** Register/refresh THIS device's Expo push token (#24). */
export async function registerPushToken(
  token: string,
  deviceId: string,
): Promise<void> {
  return request("/api/me/push-token", NO_BODY, {
    method: "POST",
    body: { token, deviceId },
    fallback: "Не вдалося зареєструвати пристрій",
  });
}

/**
 * The barista scans a Café's wall poster (#98/#99, ADR 0013) by presenting the
 * scanned (or typed) non-secret code. One call, three outcomes (the parsed
 * union): a rostered account gets `shift_started` (now in Scanner Mode); a
 * stranger gets `pending` (a request the owner approves); a barista already on
 * shift elsewhere gets `switch_required`, re-sent with `confirmSwitch: true` to
 * move. A poster code nobody printed is the only failure — surfaced as its own
 * message.
 */
export async function scanPoster(
  posterCode: string,
  confirmSwitch?: boolean,
): Promise<PosterScanResult> {
  return request("/api/poster-scans", posterScanResultSchema, {
    method: "POST",
    body: { posterCode, ...(confirmSwitch ? { confirmSwitch } : {}) },
    fallback: "Не вдалося обробити скан",
    rejections: (code) =>
      code === "unknown_poster"
        ? new Error("Такого коду немає — перевірте код на постері кав'ярні")
        : undefined,
  });
}

/** The owner's Roster board (#97): poster code, pending requests, rostered baristas. */
export async function fetchRoster(
  cafeId: string,
): Promise<RosterBoardResponse> {
  return request(`/api/cafes/${cafeId}/roster`, rosterBoardResponseSchema, {
    fallback: "Не вдалося завантажити ростер",
  });
}

/** Approve a pending request → rostered (#97). */
export async function approveBarista(
  cafeId: string,
  userId: string,
): Promise<void> {
  return request(`/api/cafes/${cafeId}/roster/${userId}/approve`, NO_BODY, {
    method: "POST",
    fallback: "Не вдалося підтвердити бариста",
  });
}

/** Remove a barista (rostered or pending) → none (#97). */
export async function removeBarista(
  cafeId: string,
  userId: string,
): Promise<void> {
  return request(`/api/cafes/${cafeId}/roster/${userId}`, NO_BODY, {
    method: "DELETE",
    fallback: "Не вдалося видалити бариста",
  });
}

export async function updateProgram(
  cafeId: string,
  program: LoyaltyProgram,
): Promise<LoyaltyProgram> {
  return request(`/api/cafes/${cafeId}/program`, loyaltyProgramSchema, {
    method: "PUT",
    body: program,
    fallback: "Не вдалося зберегти програму",
  });
}
