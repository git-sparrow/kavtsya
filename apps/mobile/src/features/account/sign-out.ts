import { DEVICE_ID_HEADER } from "@kavtsya/shared";

import { deviceId } from "@/features/push/push-registration";
import { authClient } from "@/lib/auth-client";

/**
 * Sign out of this device. The request names the device, so the server stops
 * its pushes for this account in the same step (#330). The Expo auth client
 * clears the stored session before sending, so this completes offline too.
 */
export async function signOut(): Promise<void> {
  const headers = await deviceId()
    .then((id) => ({ [DEVICE_ID_HEADER]: id }))
    .catch(() => undefined);
  await authClient.signOut({ fetchOptions: { headers } });
}
