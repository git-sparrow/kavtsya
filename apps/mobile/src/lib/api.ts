import {
  type Cafe,
  cafeSchema,
  type LoyaltyProgram,
  loyaltyProgramSchema,
  type MeResponse,
  meResponseSchema,
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
  if (error) throw new Error(error.message ?? "Не вдалося зареєструвати кав'ярню");
  return cafeSchema.parse(data);
}

/** The platform-default Reward set the config screen offers (story 38). */
export async function fetchRewardDefaults(): Promise<RewardDefaults> {
  const { data, error } = await apiFetch("/api/reward-defaults");
  if (error) throw new Error(error.message ?? "Не вдалося завантажити винагороди");
  return rewardDefaultsSchema.parse(data);
}

export async function fetchProgram(cafeId: string): Promise<LoyaltyProgram> {
  const { data, error } = await apiFetch(`/api/cafes/${cafeId}/program`);
  if (error) throw new Error(error.message ?? "Не вдалося завантажити програму");
  return loyaltyProgramSchema.parse(data);
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
