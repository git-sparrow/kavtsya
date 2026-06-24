import { type Cafe, cafeSchema, type MeResponse, meResponseSchema } from "@kavtsya/shared";

import { authClient } from "@/lib/auth-client";

// Calls to our own API go through the Better Auth client's fetch, so the Expo
// plugin attaches the SecureStore-held session cookie automatically. Responses
// are validated against the shared schemas — the same type-safe boundary the
// API enforces on the way out.

export async function fetchMe(): Promise<MeResponse> {
  const { data, error } = await authClient.$fetch("/api/me");
  if (error) throw new Error(error.message ?? "Не вдалося завантажити профіль");
  return meResponseSchema.parse(data);
}

export async function registerCafe(name: string): Promise<Cafe> {
  const { data, error } = await authClient.$fetch("/api/cafes", {
    method: "POST",
    body: { name },
  });
  if (error) throw new Error(error.message ?? "Не вдалося зареєструвати кав'ярню");
  return cafeSchema.parse(data);
}
