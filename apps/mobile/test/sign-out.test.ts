import { DEVICE_ID_HEADER } from "@kavtsya/shared";
import { beforeEach, expect, it, vi } from "vitest";

/**
 * Sign-out (#330) names this device, so the server releases its push token in
 * the same request that ends the session — and then leaves nothing of the
 * account on the device (#402).
 */

const store = new Map<string, string>();
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => store.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    store.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    store.delete(key);
  },
}));
const authSignOut = vi.fn(async (_options: unknown) => {});
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: authSignOut } }));
vi.mock("@/lib/api", () => ({}));
vi.mock("expo-notifications", () => ({}));

const { signOut } = await import("../src/features/account/sign-out");

beforeEach(() => {
  store.clear();
  authSignOut.mockReset();
});

it("signs out naming this device", async () => {
  store.set("kavtsya.device_id", "device-1");

  await signOut("user-a");

  expect(authSignOut).toHaveBeenCalledExactlyOnceWith({
    fetchOptions: { headers: { [DEVICE_ID_HEADER]: "device-1" } },
  });
});

it("still signs out when the device id can't be read", async () => {
  const SecureStore = await import("expo-secure-store");
  vi.spyOn(SecureStore, "getItemAsync").mockRejectedValueOnce(
    new Error("keychain locked"),
  );

  await signOut("user-a");

  expect(authSignOut).toHaveBeenCalledExactlyOnceWith({
    fetchOptions: { headers: undefined },
  });
});

it("leaves none of the account's data on the device", async () => {
  store.set("kavtsya.device_id", "device-1");
  store.set("kavtsya.member_code.user-a", "K7-1234");
  store.set("kavtsya.push_consent_decided.user-a", "yes");

  await signOut("user-a");

  expect([...store.keys()]).toEqual([]);
});

it("keeps other accounts' data and the device's appearance choice", async () => {
  store.set("kavtsya.member_code.user-a", "K7-1234");
  store.set("kavtsya.member_code.user-b", "K7-5678");
  store.set("kavtsya.push_consent_decided.user-b", "no");
  store.set("kavtsya.theme_preference", "dark");

  await signOut("user-a");

  expect(Object.fromEntries(store)).toEqual({
    "kavtsya.member_code.user-b": "K7-5678",
    "kavtsya.push_consent_decided.user-b": "no",
    "kavtsya.theme_preference": "dark",
  });
});

it("clears the account's data even when the sign-out request fails", async () => {
  store.set("kavtsya.member_code.user-a", "K7-1234");
  authSignOut.mockRejectedValueOnce(new Error("network down"));

  await signOut("user-a");

  expect(store.has("kavtsya.member_code.user-a")).toBe(false);
});
