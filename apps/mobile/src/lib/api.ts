import {
  type Cafe,
  type CafeBalancesResponse,
  cafeBalancesResponseSchema,
  cafeSchema,
  type LoyaltyProgram,
  loyaltyProgramSchema,
  type MeResponse,
  meResponseSchema,
  type PurchaseResult,
  purchaseResultSchema,
  type QrTokenResponse,
  qrTokenResponseSchema,
  type RewardDefaults,
  rewardDefaultsSchema,
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
 * distinguishes (#20). The message is the feedback — the screen just shows it.
 */
const SCAN_REJECTIONS: Record<string, string> = {
  token_used: "Цей код уже використано — попросіть клієнта показати новий",
  expired_token: "Код протермінувався — попросіть клієнта показати новий",
  invalid_token: "Це не QR-код Кавці",
  own_cafe: "У власній кав'ярні зернятка не нараховуються",
  not_found: "Кав'ярню не знайдено",
};

/**
 * The CafeOwner's scan (#20): send the scanned rotating QR token and get back
 * who earned the Зернятко and their new derived balance.
 */
export async function issuePurchase(
  cafeId: string,
  qrToken: string,
): Promise<PurchaseResult> {
  const { data, error } = await apiFetch("/api/purchases", {
    method: "POST",
    body: { cafeId, qrToken },
  });
  if (error) {
    // Our API's error bodies are { error: "<code>" }; better-fetch folds the
    // parsed body into the error object, so the code sits on `error.error`.
    const code = (error as { error?: string }).error;
    throw new Error(
      (code && SCAN_REJECTIONS[code]) ??
        error.message ??
        "Не вдалося нарахувати зернятко",
    );
  }
  return purchaseResultSchema.parse(data);
}

/** The Cafés where the Customer holds Зернятка (most recently visited first). */
export async function fetchBalances(): Promise<CafeBalancesResponse> {
  const { data, error } = await apiFetch("/api/me/balances");
  if (error)
    throw new Error(error.message ?? "Не вдалося завантажити зернятка");
  return cafeBalancesResponseSchema.parse(data);
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
