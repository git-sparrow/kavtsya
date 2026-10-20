import { useEffect } from "react";

import { registerDeviceForPush } from "@/features/push/push-registration";

/**
 * Token upkeep for the signed-in account, in every Mode (#24, #330). Each
 * sign-in refreshes this device's token once `/api/me` has answered, which
 * re-activates it after a sign-out and moves a handed-over device's token to
 * the account now signed in. Only a consenting account may be shown the OS
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
