import { releaseDeviceFromPush } from "@/features/push/push-registration";
import { authClient } from "@/lib/auth-client";

/**
 * How long sign-out waits for the push release before signing out anyway. A
 * phone offline or on a stalled network must still sign out promptly.
 */
export const RELEASE_TIMEOUT_MS = 3_000;

/**
 * Sign out of this device (#330): release its push token while the session can
 * still authenticate that, then end the session. The release is best effort.
 * When it can't reach the server, the token is taken over by the next account
 * to sign in on the device, which refreshes it on arrival.
 */
export async function signOut(): Promise<void> {
  await Promise.race([
    releaseDeviceFromPush().catch(() => {}),
    new Promise<void>((resolve) => setTimeout(resolve, RELEASE_TIMEOUT_MS)),
  ]);
  await authClient.signOut();
}
