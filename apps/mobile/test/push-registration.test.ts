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
const releasePushToken = vi.fn<(deviceId: string) => Promise<void>>();
vi.mock("@/lib/api", () => ({ registerPushToken, releasePushToken }));

const { registerDeviceForPush, releaseDeviceFromPush } =
  await import("../src/features/push/push-registration");

beforeEach(() => {
  vi.resetAllMocks();
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

describe("releaseDeviceFromPush", () => {
  it("a registration still fetching its token never lands after the release", async () => {
    getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    let deliverToken!: (value: { data: string }) => void;
    getExpoPushTokenAsync.mockReturnValue(
      new Promise((resolve) => {
        deliverToken = resolve;
      }),
    );
    releasePushToken.mockResolvedValue(undefined);

    const registering = registerDeviceForPush({ askPermission: false });
    await vi.waitFor(() => expect(getExpoPushTokenAsync).toHaveBeenCalled());
    await releaseDeviceFromPush();
    deliverToken({ data: "ExponentPushToken[x]" });
    await registering;

    expect(releasePushToken).toHaveBeenCalledWith("device-1");
    expect(registerPushToken).not.toHaveBeenCalled();
  });

  it("a registration already sent is answered before the release goes out", async () => {
    getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    const order: string[] = [];
    let answerRegistration!: () => void;
    registerPushToken.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          answerRegistration = () => {
            order.push("registered");
            resolve();
          };
        }),
    );
    releasePushToken.mockImplementation(async () => {
      order.push("released");
    });

    const registering = registerDeviceForPush({ askPermission: false });
    await vi.waitFor(() => expect(registerPushToken).toHaveBeenCalled());
    const releasing = releaseDeviceFromPush();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(releasePushToken).not.toHaveBeenCalled();
    answerRegistration();
    await Promise.all([registering, releasing]);

    expect(order).toEqual(["registered", "released"]);
  });
});
