import * as SecureStore from "expo-secure-store";

/**
 * Every SecureStore entry the app keeps PER ACCOUNT (#91). Each one is removed
 * when the account's session ends (#402, #438), so a per-account entry exists
 * only by being listed here.
 */
const ACCOUNT_ENTRIES = ["member_code", "push_consent_decided"] as const;

type AccountEntry = (typeof ACCOUNT_ENTRIES)[number];

/** SecureStore keys allow only [A-Za-z0-9._-]; user ids are sanitized into it. */
export function accountKey(entry: AccountEntry, userId: string): string {
  return `kavtsya.${entry}.${userId.replace(/[^A-Za-z0-9._-]/g, "_")}`;
}

/** Remove the account's entries from this device; never throws. */
export async function forgetAccount(userId: string): Promise<void> {
  await Promise.allSettled(
    ACCOUNT_ENTRIES.map((entry) =>
      SecureStore.deleteItemAsync(accountKey(entry, userId)),
    ),
  );
}

/**
 * The account whose entries this device holds. It outlives the session, so an
 * account whose session ended while the app was closed can still be found and
 * forgotten on the next launch (#438).
 */
const HELD_ACCOUNT_KEY = "kavtsya.held_account";

export function heldAccount(): Promise<string | null> {
  return SecureStore.getItemAsync(HELD_ACCOUNT_KEY);
}

export function holdAccount(userId: string): Promise<void> {
  return SecureStore.setItemAsync(HELD_ACCOUNT_KEY, userId);
}

export async function releaseAccount(): Promise<void> {
  await SecureStore.deleteItemAsync(HELD_ACCOUNT_KEY).catch(() => {});
}
