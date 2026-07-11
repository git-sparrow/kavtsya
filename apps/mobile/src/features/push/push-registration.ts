import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

import { registerPushToken } from "@/lib/api";

/**
 * One opaque id per INSTALL, deliberately shared across accounts — it names
 * the device, and `push_tokens` is per device (#24). Uniqueness is all it
 * needs (it keys a refresh, not a secret).
 */
const DEVICE_ID_KEY = "kavtsya.device_id";

async function deviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const minted = `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  await SecureStore.setItemAsync(DEVICE_ID_KEY, minted);
  return minted;
}

/**
 * Where remote push can't work, `getExpoPushTokenAsync` doesn't always throw —
 * in Expo Go it can simply never settle (verified on-device, #24) — so the
 * fetch is time-boxed. Callers must NOT await this function on any UI path.
 */
const TOKEN_FETCH_TIMEOUT_MS = 10_000;

/**
 * Try to register this device for café news (#24): OS permission (asked here,
 * AFTER the in-app consent — never before), then the Expo push token, then the
 * server upsert. Fire-and-forget by design: quietly a no-op wherever remote
 * push can't work — Expo Go (SDK 53+) and simulators can't mint a token —
 * because the server re-checks consent at every send anyway: a missing token
 * only means this device isn't reachable yet; a dev build on real hardware
 * will be.
 */
export async function registerDeviceForPush(): Promise<void> {
  try {
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await Notifications.requestPermissionsAsync();
    }
    if (!permission.granted) return;

    const { data: token } = await Promise.race([
      Notifications.getExpoPushTokenAsync(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("push token fetch timed out")),
          TOKEN_FETCH_TIMEOUT_MS,
        ),
      ),
    ]);
    await registerPushToken(token, await deviceId());
  } catch {
    // No push surface here (Expo Go / simulator / declined) — nothing to do.
  }
}
