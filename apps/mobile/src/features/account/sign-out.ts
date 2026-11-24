import { DEVICE_ID_HEADER } from "@kavtsya/shared";
import { useCallback } from "react";

import { deviceId, forgetDeviceId } from "@/features/push/push-registration";
import { authClient } from "@/lib/auth-client";

import { forgetAccount } from "./account-storage";

/**
 * Sign `userId` out of this device and leave none of its data behind (#402);
 * with no known account, only the device id is forgotten.
 * The request names the device, so the server stops its pushes for this
 * account in the same step (#330). If the device id can't be read, sign-out
 * goes ahead without it and the token stays active until another account
 * registers on the device — a residual the maintainer accepted (2026-10-20).
 * The Expo auth client clears the stored session before sending
 * (`@better-auth/expo` 1.7.7 `client.js:598-606,723`, read 2026-10-20), so the
 * device is signed out even when the request fails, and the cleanup runs
 * regardless.
 */
export async function signOut(userId: string | undefined): Promise<void> {
  const headers = await deviceId()
    .then((id) => ({ [DEVICE_ID_HEADER]: id }))
    .catch(() => undefined);
  await authClient.signOut({ fetchOptions: { headers } }).catch(() => {});
  await Promise.all([userId && forgetAccount(userId), forgetDeviceId()]);
}

/** {@link signOut} for whichever account is signed in on this device. */
export function useSignOut(): () => Promise<void> {
  const userId = authClient.useSession().data?.user.id;
  return useCallback(() => signOut(userId), [userId]);
}
