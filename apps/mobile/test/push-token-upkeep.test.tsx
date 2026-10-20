import { afterEach, expect, it, vi } from "vitest";

import { cleanup, renderHook } from "./support/render-hook";

/**
 * Token upkeep (#330) runs from the Home dispatcher, so every Mode refreshes
 * this device's token for the account signed in, and only consent may prompt.
 */

const registerDeviceForPush =
  vi.fn<(options: { askPermission: boolean }) => Promise<void>>();
vi.mock("@/features/push/push-registration", () => ({
  registerDeviceForPush,
}));

const { usePushTokenUpkeep } =
  await import("../src/features/push/use-push-token-upkeep");

afterEach(() => {
  cleanup();
  registerDeviceForPush.mockReset();
});

it("waits for /api/me before touching the token", () => {
  renderHook(() => usePushTokenUpkeep(undefined));

  expect(registerDeviceForPush).not.toHaveBeenCalled();
});

it("refreshes without prompting for an account that hasn't consented", () => {
  renderHook(() => usePushTokenUpkeep(false));

  expect(registerDeviceForPush).toHaveBeenCalledExactlyOnceWith({
    askPermission: false,
  });
});

it("may prompt for a consenting account", () => {
  renderHook(() => usePushTokenUpkeep(true));

  expect(registerDeviceForPush).toHaveBeenCalledExactlyOnceWith({
    askPermission: true,
  });
});
