import { DEVICE_ID_HEADER } from "@kavtsya/shared";

import { deviceId } from "@/features/push/push-registration";
import { authClient } from "@/lib/auth-client";

/**
 * Sign out of this device. The request names the device, so the server stops
 * its pushes for this account in the same step (#330). If the device id can't
 * be read, sign-out goes ahead without it and the token stays active until
 * another account registers on the device — a residual the maintainer accepted
 * (2026-10-20). The Expo auth client clears the stored session before sending
 * (`@better-auth/expo` 1.7.7 `client.js:598-606,723`, read 2026-10-20), so
 * this completes offline too.
 */
export async function signOut(): Promise<void> {
  const headers = await deviceId()
    .then((id) => ({ [DEVICE_ID_HEADER]: id }))
    .catch(() => undefined);
  await authClient.signOut({ fetchOptions: { headers } });
}
