import * as SecureStore from "expo-secure-store";

/**
 * Every SecureStore entry the app keeps PER ACCOUNT (#91). Sign-out removes
 * each one (#402), so a per-account entry exists only by being listed here.
 */
const ACCOUNT_ENTRIES = ["member_code", "push_consent_decided"] as const;

type AccountEntry = (typeof ACCOUNT_ENTRIES)[number];

/** SecureStore keys allow only [A-Za-z0-9._-]; user ids are sanitized into it. */
export function accountKey(entry: AccountEntry, userId: string): string {
  return `kavtsya.${entry}.${userId.replace(/[^A-Za-z0-9._-]/g, "_")}`;
}

/** The only way to write a per-account entry, so `forgetAccount` can clear it. */
export function setAccountEntry(
  entry: AccountEntry,
  userId: string,
  value: string,
): Promise<void> {
  return SecureStore.setItemAsync(accountKey(entry, userId), value);
}

/** Remove the account's entries from this device; never throws. */
export async function forgetAccount(userId: string): Promise<void> {
  await Promise.allSettled(
    ACCOUNT_ENTRIES.map((entry) =>
      SecureStore.deleteItemAsync(accountKey(entry, userId)),
    ),
  );
}
