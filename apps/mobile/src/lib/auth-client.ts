import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

// Same API base the health check uses (see .env.example). The Better Auth
// client appends /api/auth/* itself.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * Better Auth client for the app. The Expo plugin stores the session in
 * SecureStore, so it survives app restarts (acceptance criterion), and uses the
 * `kavtsya://` scheme for native redirects (needed later for Google/Apple).
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({
      scheme: "kavtsya",
      storagePrefix: "kavtsya",
      storage: SecureStore,
    }),
  ],
});

/**
 * Fetch one of our own (non-auth) API routes through the Better Auth client so
 * the Expo plugin still attaches the SecureStore session cookie — but against
 * the API root, not Better Auth's `/api/auth` base. Without the `baseURL`
 * override, `$fetch("/api/me")` resolves to `/api/auth/api/me` and 404s.
 *
 * Loosely typed on purpose: `$fetch`'s generic signature is awkward to alias,
 * and every caller re-validates `data` against a shared Zod schema anyway.
 */
export function apiFetch(
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<{ data: unknown; error: { message?: string } | null }> {
  return authClient.$fetch(path, { baseURL: API_URL, ...options } as never);
}
