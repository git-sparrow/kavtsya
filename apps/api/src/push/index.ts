import { z } from "zod";
import { createExpoPushProvider } from "./expo";
import type { PushProvider } from "./provider";

export type {
  PushMessage,
  PushProvider,
  PushReceipt,
  PushTicket,
} from "./provider";

/**
 * Provider selection is an env concern, same shape as `createAIProvider`
 * (ADR 0007): `PUSH_PROVIDER` picks the transport. Unlike the AI key, no
 * variable is required — Expo's push API accepts unauthenticated sends unless
 * the account enables enhanced security (`EXPO_ACCESS_TOKEN` then applies) —
 * so the API server boots without any push config.
 */
const pushEnvSchema = z.object({
  PUSH_PROVIDER: z.enum(["expo"]).default("expo"),
  EXPO_ACCESS_TOKEN: z.string().min(1).optional(),
});

export function createPushProvider(
  source: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
): PushProvider {
  const parsed = pushEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid push environment: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return createExpoPushProvider({
    accessToken: parsed.data.EXPO_ACCESS_TOKEN,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
}
