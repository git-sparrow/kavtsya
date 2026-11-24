import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Push registration (#24, #330): the OS prompt only ever follows the in-app
 * café-news consent, but a device the OS already allows refreshes its token
 * without it, so operational pushes (#97) survive a sign-out and sign-in.
 */

const getPermissionsAsync = vi.fn();
const requestPermissionsAsync = vi.fn();
const getExpoPushTokenAsync = vi.fn();
vi.mock("expo-notifications", () => ({
  getPermissionsAsync,
  requestPermissionsAsync,
  getExpoPushTokenAsync,
}));
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
const registerPushToken =
  vi.fn<(token: string, deviceId: string) => Promise<void>>();
vi.mock("@/lib/api", () => ({ registerPushToken }));

const { registerDeviceForPush } =
  await import("../src/features/push/push-registration");

beforeEach(() => {
  vi.resetAllMocks();
  store.clear();
  store.set("kavtsya.device_id", "device-1");
  getExpoPushTokenAsync.mockResolvedValue({ data: "ExponentPushToken[x]" });
  registerPushToken.mockResolvedValue(undefined);
});

describe("registerDeviceForPush", () => {
  it("refreshes the token without consent when the OS already allows pushes", async () => {
    getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });

    await registerDeviceForPush({ askPermission: false });

    expect(requestPermissionsAsync).not.toHaveBeenCalled();
    expect(registerPushToken).toHaveBeenCalledWith(
      "ExponentPushToken[x]",
      "device-1",
    );
  });

  it("never shows the OS prompt without consent", async () => {
    getPermissionsAsync.mockResolvedValue({
      granted: false,
      canAskAgain: true,
    });

    await registerDeviceForPush({ askPermission: false });

    expect(requestPermissionsAsync).not.toHaveBeenCalled();
    expect(registerPushToken).not.toHaveBeenCalled();
  });

  it("asks the OS after consent, and registers once allowed", async () => {
    getPermissionsAsync.mockResolvedValue({
      granted: false,
      canAskAgain: true,
    });
    requestPermissionsAsync.mockResolvedValue({ granted: true });

    await registerDeviceForPush({ askPermission: true });

    expect(requestPermissionsAsync).toHaveBeenCalledOnce();
    expect(registerPushToken).toHaveBeenCalledOnce();
  });

  it("leaves no device id behind when sign-out lands during the token wait (#402)", async () => {
    getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    let deliverToken!: (value: { data: string }) => void;
    getExpoPushTokenAsync.mockReturnValue(
      new Promise((resolve) => (deliverToken = resolve)),
    );

    const registering = registerDeviceForPush({ askPermission: false });
    await vi.waitFor(() => expect(getExpoPushTokenAsync).toHaveBeenCalled());
    store.delete("kavtsya.device_id"); // sign-out
    deliverToken({ data: "ExponentPushToken[x]" });
    await registering;

    expect(store.has("kavtsya.device_id")).toBe(false);
  });
});
