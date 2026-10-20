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
vi.mock("expo-secure-store", () => ({
  getItemAsync: async () => "device-1",
  setItemAsync: async () => {},
}));
const registerPushToken =
  vi.fn<(token: string, deviceId: string) => Promise<void>>();
vi.mock("@/lib/api", () => ({ registerPushToken }));

const { registerDeviceForPush } =
  await import("../src/features/push/push-registration");

beforeEach(() => {
  vi.clearAllMocks();
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
});
