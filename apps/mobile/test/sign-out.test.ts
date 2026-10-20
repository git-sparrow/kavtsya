import { beforeEach, expect, it, vi } from "vitest";

/**
 * Sign-out (#330): release this device's pushes first, while the session can
 * still authenticate that, then end the session. An offline phone must still
 * sign out, promptly.
 */

const calls: string[] = [];
const releaseDeviceFromPush = vi.fn<() => Promise<void>>();
vi.mock("@/features/push/push-registration", () => ({
  releaseDeviceFromPush,
}));
const authSignOut = vi.fn(async () => {
  calls.push("signOut");
});
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: authSignOut } }));

const { signOut, RELEASE_TIMEOUT_MS } =
  await import("../src/features/account/sign-out");

beforeEach(() => {
  vi.useRealTimers();
  calls.length = 0;
  releaseDeviceFromPush.mockReset();
  authSignOut.mockClear();
});

it("releases the device before ending the session", async () => {
  releaseDeviceFromPush.mockImplementation(async () => {
    calls.push("release");
  });

  await signOut();

  expect(calls).toEqual(["release", "signOut"]);
});

it("still signs out when the release fails", async () => {
  releaseDeviceFromPush.mockRejectedValue(new Error("offline"));

  await signOut();

  expect(authSignOut).toHaveBeenCalledOnce();
});

it("signs out after the timeout when the release never answers", async () => {
  vi.useFakeTimers();
  releaseDeviceFromPush.mockReturnValue(new Promise<void>(() => {}));

  const done = signOut();
  await vi.advanceTimersByTimeAsync(RELEASE_TIMEOUT_MS - 1);
  expect(authSignOut).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await done;

  expect(authSignOut).toHaveBeenCalledOnce();
});
