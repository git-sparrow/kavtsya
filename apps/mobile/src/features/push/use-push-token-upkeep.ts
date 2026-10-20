import { useEffect } from "react";

import { registerDeviceForPush } from "@/features/push/push-registration";

/**
 * Token upkeep for the signed-in account, in every Mode (#24, #330): this
 * device's token is refreshed once `/api/me` has answered and again whenever
 * consent changes. That re-activates it after a sign-out, moves a handed-over
 * device's token to the account now signed in, and is the one place a consent
 * choice turns into a registration. Only a consenting account may be shown the OS
 * prompt; any account refreshes a token the OS already allows, because
 * operational pushes (#97) aren't gated by marketing consent.
 *
 * @param consentsToPush the account's café-news consent, `undefined` until
 *   `/api/me` has loaded.
 */
export function usePushTokenUpkeep(consentsToPush: boolean | undefined): void {
  useEffect(() => {
    if (consentsToPush === undefined) return;
    void registerDeviceForPush({ askPermission: consentsToPush });
  }, [consentsToPush]);
}
