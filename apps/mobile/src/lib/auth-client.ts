import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

/** Port the API listens on in local development (see `apps/api`, `PORT`). */
const DEV_API_PORT = 3000;

/**
 * Base URL of our API. The Better Auth client appends `/api/auth/*` itself.
 *
 * Resolution order matters, because `localhost` means something different on
 * every target:
 *
 * 1. `EXPO_PUBLIC_API_URL` wins when set — that is how a deployed build points
 *    at the real API, and how anyone overrides the guess below.
 * 2. Otherwise derive the host from Metro. `hostUri` is the address the bundle
 *    was actually served from, so it is `localhost:8081` on a simulator but the
 *    machine's LAN address (e.g. `192.168.0.32:8081`) on a physical device —
 *    exactly the host its API is reachable on. Deriving it means a device build
 *    needs no hand-edited IP, and keeps working when DHCP moves the machine.
 * 3. Fall back to `localhost` when there is no Metro host (a production build
 *    with no env var — misconfigured, but better than crashing at import time).
 *
 * Note this assumes the API runs on the same host as Metro, which holds for
 * local development and is the only case where step 2 applies at all.
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;

  // hostUri is "host:port" — take the host and pair it with the API's port.
  const metroHost = Constants.expoConfig?.hostUri?.split(":")[0];
  if (metroHost) return `http://${metroHost}:${DEV_API_PORT}`;

  return `http://localhost:${DEV_API_PORT}`;
}

const API_URL = resolveApiUrl();

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
 * Better Auth's client parses response bodies with a reviver that turns ISO
 * date strings into Date objects, which our shared schemas (wire format:
 * strings, e.g. `expiresAt: z.string().datetime()`) reject (#85). A per-call
 * jsonParser overrides that for our routes only — Better Auth's own session
 * handling keeps the parser it expects.
 */
function apiJsonParser(text: string): unknown {
  return text ? JSON.parse(text) : null;
}

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
  return authClient.$fetch(path, {
    baseURL: API_URL,
    jsonParser: apiJsonParser,
    ...options,
  } as never);
}
