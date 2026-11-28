import { DEVICE_ID_HEADER } from "@kavtsya/shared";

import { deviceId } from "@/features/push/push-registration";
import { authClient } from "@/lib/auth-client";

/**
 * End this device's session. The request names the device, so the server stops
 * its pushes for the account in the same step (#330); the device id read here
 * is forgotten only after, with the rest of the account's data, once the
 * session has ended (`useDeviceSession`, #438). If the device id can't be read,
 * sign-out goes ahead without it and the token stays active until another
 * account registers on the device — a residual the maintainer accepted
 * (2026-10-20). The Expo auth client clears the stored session before sending
 * (`@better-auth/expo` 1.7.18 `client.js:599-607,727`, read 2026-11-28), so the
 * device is signed out even when the request fails.
 */
export async function signOut(): Promise<void> {
  const headers = await deviceId()
    .then((id) => ({ [DEVICE_ID_HEADER]: id }))
    .catch(() => undefined);
  await authClient.signOut({ fetchOptions: { headers } }).catch(() => {});
}
