import { DEVICE_ID_HEADER } from "@kavtsya/shared";
import { beforeEach, expect, it, vi } from "vitest";

/**
 * Sign-out (#330) names this device, so the server releases its push token in
 * the same request that ends the session. Clearing the account's data once the
 * session has ended is `device-session.test.tsx`.
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

  await signOut();

  expect(authSignOut).toHaveBeenCalledExactlyOnceWith({
    fetchOptions: { headers: { [DEVICE_ID_HEADER]: "device-1" } },
  });
});

it("still signs out when the device id can't be read", async () => {
  const SecureStore = await import("expo-secure-store");
  vi.spyOn(SecureStore, "getItemAsync").mockRejectedValueOnce(
    new Error("keychain locked"),
  );

  await signOut();

  expect(authSignOut).toHaveBeenCalledExactlyOnceWith({
    fetchOptions: { headers: undefined },
  });
});
