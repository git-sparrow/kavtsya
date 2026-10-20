import { DEVICE_ID_HEADER } from "@kavtsya/shared";
import { beforeEach, expect, it, vi } from "vitest";

/**
 * Sign-out (#330) names this device, so the server releases its push token in
 * the same request that ends the session.
 */

const deviceId = vi.fn<() => Promise<string>>();
vi.mock("@/features/push/push-registration", () => ({ deviceId }));
const authSignOut = vi.fn(async (_options: unknown) => {});
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: authSignOut } }));

const { signOut } = await import("../src/features/account/sign-out");

beforeEach(() => {
  deviceId.mockReset();
  authSignOut.mockClear();
});

it("signs out naming this device", async () => {
  deviceId.mockResolvedValue("device-1");

  await signOut();

  expect(authSignOut).toHaveBeenCalledExactlyOnceWith({
    fetchOptions: { headers: { [DEVICE_ID_HEADER]: "device-1" } },
  });
});

it("still signs out when the device id can't be read", async () => {
  deviceId.mockRejectedValue(new Error("keychain locked"));

  await signOut();

  expect(authSignOut).toHaveBeenCalledExactlyOnceWith({
    fetchOptions: { headers: undefined },
  });
});
