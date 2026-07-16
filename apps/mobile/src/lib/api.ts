import {
  type Cafe,
  type CafeBalancesResponse,
  cafeBalancesResponseSchema,
  cafeSchema,
  type CampaignRejection,
  type CampaignResult,
  campaignResultSchema,
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

export async function fetchMe(): Promise<MeResponse> {
  const { data, error } = await apiFetch("/api/me");
  if (error) throw new Error(error.message ?? "Не вдалося завантажити профіль");
  return meResponseSchema.parse(data);
}

export async function registerCafe(name: string): Promise<Cafe> {
  const { data, error } = await apiFetch("/api/cafes", {
    method: "POST",
    body: { name },
  });
  if (error)
    throw new Error(error.message ?? "Не вдалося зареєструвати кав'ярню");
  return cafeSchema.parse(data);
}

/**
 * The Customer's rotating QR token (ADR 0006). The app renders `token` as a QR
 * and refetches before `expiresAt` so the code on screen is always fresh.
 */
export async function fetchQrToken(): Promise<QrTokenResponse> {
  const { data, error } = await apiFetch("/api/qr-token");
  if (error) throw new Error(error.message ?? "Не вдалося оновити QR-код");
  return qrTokenResponseSchema.parse(data);
}

/** The platform-default Reward set the config screen offers (story 38). */
export async function fetchRewardDefaults(): Promise<RewardDefaults> {
  const { data, error } = await apiFetch("/api/reward-defaults");
  if (error)
    throw new Error(error.message ?? "Не вдалося завантажити винагороди");
  return rewardDefaultsSchema.parse(data);
}

export async function fetchProgram(cafeId: string): Promise<LoyaltyProgram> {
  const { data, error } = await apiFetch(`/api/cafes/${cafeId}/program`);
  if (error)
    throw new Error(error.message ?? "Не вдалося завантажити програму");
  return loyaltyProgramSchema.parse(data);
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
 */
async function requestPurchase(
  body: { cafeId: string } & ({ qrToken: string } | { memberCode: string }),
): Promise<PurchaseResult> {
  const { data, error } = await apiFetch("/api/purchases", {
    method: "POST",
    body,
  });
  if (error) {
    // Our API's error bodies are { error: "<code>" }; better-fetch folds the
    // parsed body into the error object, so the code sits on `error.error`.
    const code = (error as { error?: string }).error;
    if (code && isScanRejection(code)) throw new Error(SCAN_REJECTIONS[code]);
    throw new Error(error.message ?? "Не вдалося нарахувати зернятко");
  }
  return purchaseResultSchema.parse(data);
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
  const { data, error } = await apiFetch("/api/me/member-code");
  if (error) throw new Error(error.message ?? "Не вдалося отримати код");
  return memberCodeResponseSchema.parse(data).memberCode;
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
  const { data, error } = await apiFetch("/api/redemptions", {
    method: "POST",
    body: { cafeId, customerId, idempotencyKey },
  });
  if (error) {
    const code = (error as { error?: string }).error;
    if (code && isRedemptionRejection(code)) {
      throw new Error(REDEMPTION_REJECTIONS[code]);
    }
    throw new Error(error.message ?? "Не вдалося видати винагороду");
  }
  return redemptionResultSchema.parse(data);
}

/** The owner's shift board (#98): who is behind the counter right now. */
export async function fetchShifts(cafeId: string): Promise<ShiftsResponse> {
  const { data, error } = await apiFetch(`/api/cafes/${cafeId}/shifts`);
  if (error) throw new Error(error.message ?? "Не вдалося завантажити зміни");
  return shiftsResponseSchema.parse(data);
}

/** Revocation is a tap (#99): the shift ends now instead of at its ~16h cap. */
export async function revokeShift(
  cafeId: string,
  grantId: string,
): Promise<void> {
  const { error } = await apiFetch(`/api/cafes/${cafeId}/shifts/${grantId}`, {
    method: "DELETE",
  });
  if (error) throw new Error(error.message ?? "Не вдалося завершити зміну");
}

/**
 * The barista ends their own shift (#96, ADR 0015): «Завершити зміну» revokes
 * the grant server-side so the app re-derives out of the near-kiosk Scanner
 * Mode. Idempotent on the server — a no-op when nothing is active.
 */
export async function endMyShift(): Promise<void> {
  const { error } = await apiFetch("/api/me/shift", { method: "DELETE" });
  if (error) throw new Error(error.message ?? "Не вдалося завершити зміну");
}

/** The barista's side (#98): the active shift this account holds, or null. */
export async function fetchMyShift(): Promise<MyShiftResponse["shift"]> {
  const { data, error } = await apiFetch("/api/me/shift");
  if (error) throw new Error(error.message ?? "Не вдалося перевірити зміну");
  return myShiftResponseSchema.parse(data).shift;
}

/** The Cafés where the Customer holds Зернятка (most recently visited first). */
export async function fetchBalances(): Promise<CafeBalancesResponse> {
  const { data, error } = await apiFetch("/api/me/balances");
  if (error)
    throw new Error(error.message ?? "Не вдалося завантажити зернятка");
  return cafeBalancesResponseSchema.parse(data);
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
  const { data, error } = await apiFetch(`/api/cafes/${cafeId}/campaigns`, {
    method: "POST",
    body: { message },
  });
  if (error) {
    const code = (error as { error?: string }).error;
    if (code && isCampaignRejection(code)) {
      throw new Error(CAMPAIGN_REJECTIONS[code]);
    }
    throw new Error(error.message ?? "Не вдалося надіслати розсилку");
  }
  return campaignResultSchema.parse(data);
}

/** The Customer's explicit café-news opt-in (#24): flip it on the server. */
export async function updatePushConsent(consent: boolean): Promise<void> {
  const { error } = await apiFetch("/api/me/push-consent", {
    method: "PUT",
    body: { consent },
  });
  if (error) throw new Error(error.message ?? "Не вдалося зберегти вибір");
}

/** Register/refresh THIS device's Expo push token (#24). */
export async function registerPushToken(
  token: string,
  deviceId: string,
): Promise<void> {
  const { error } = await apiFetch("/api/me/push-token", {
    method: "POST",
    body: { token, deviceId },
  });
  if (error)
    throw new Error(error.message ?? "Не вдалося зареєструвати пристрій");
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
  const { data, error } = await apiFetch("/api/poster-scans", {
    method: "POST",
    body: { posterCode, ...(confirmSwitch ? { confirmSwitch } : {}) },
  });
  if (error) {
    const code = (error as { error?: string }).error;
    if (code === "unknown_poster") {
      throw new Error("Такого коду немає — перевірте код на постері кав'ярні");
    }
    throw new Error(error.message ?? "Не вдалося обробити скан");
  }
  return posterScanResultSchema.parse(data);
}

/** The owner's Roster board (#97): poster code, pending requests, rostered baristas. */
export async function fetchRoster(
  cafeId: string,
): Promise<RosterBoardResponse> {
  const { data, error } = await apiFetch(`/api/cafes/${cafeId}/roster`);
  if (error) throw new Error(error.message ?? "Не вдалося завантажити ростер");
  return rosterBoardResponseSchema.parse(data);
}

/** Approve a pending request → rostered (#97). */
export async function approveBarista(
  cafeId: string,
  userId: string,
): Promise<void> {
  const { error } = await apiFetch(
    `/api/cafes/${cafeId}/roster/${userId}/approve`,
    { method: "POST" },
  );
  if (error) throw new Error(error.message ?? "Не вдалося підтвердити бариста");
}

/** Remove a barista (rostered or pending) → none (#97). */
export async function removeBarista(
  cafeId: string,
  userId: string,
): Promise<void> {
  const { error } = await apiFetch(`/api/cafes/${cafeId}/roster/${userId}`, {
    method: "DELETE",
  });
  if (error) throw new Error(error.message ?? "Не вдалося видалити бариста");
}

export async function updateProgram(
  cafeId: string,
  program: LoyaltyProgram,
): Promise<LoyaltyProgram> {
  const { data, error } = await apiFetch(`/api/cafes/${cafeId}/program`, {
    method: "PUT",
    body: program,
  });
  if (error) throw new Error(error.message ?? "Не вдалося зберегти програму");
  return loyaltyProgramSchema.parse(data);
}
