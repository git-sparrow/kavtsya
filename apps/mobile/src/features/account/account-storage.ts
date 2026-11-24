import * as SecureStore from "expo-secure-store";

/**
 * Every SecureStore entry the app keeps PER ACCOUNT (#91), named in one place
 * so sign-out can remove them all (#402). A new per-account entry gets its key
 * here, or sign-out leaves it behind. SecureStore keys allow only
 * [A-Za-z0-9._-]; user ids are sanitized into that alphabet.
 */
function accountKey(name: string, userId: string): string {
  return `kavtsya.${name}.${userId.replace(/[^A-Za-z0-9._-]/g, "_")}`;
}

export const memberCodeKey = (userId: string) =>
  accountKey("member_code", userId);

export const pushConsentDecidedKey = (userId: string) =>
  accountKey("push_consent_decided", userId);

/** Remove the account's entries from this device; never throws. */
export async function forgetAccount(userId: string): Promise<void> {
  await Promise.allSettled(
    [memberCodeKey(userId), pushConsentDecidedKey(userId)].map((key) =>
      SecureStore.deleteItemAsync(key),
    ),
  );
}
