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

/** Remove the account's entries from this device; never throws. */
export async function forgetAccount(userId: string): Promise<void> {
  await Promise.allSettled(
    ACCOUNT_ENTRIES.map((entry) =>
      SecureStore.deleteItemAsync(accountKey(entry, userId)),
    ),
  );
}

const ACCOUNT_ON_DEVICE_KEY = "kavtsya.account_on_device";

export function accountOnDevice(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCOUNT_ON_DEVICE_KEY);
}

export function setAccountOnDevice(userId: string): Promise<void> {
  return SecureStore.setItemAsync(ACCOUNT_ON_DEVICE_KEY, userId);
}

export async function clearAccountOnDevice(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCOUNT_ON_DEVICE_KEY).catch(() => {});
}
