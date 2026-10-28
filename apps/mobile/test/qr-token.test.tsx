import type { QrTokenResponse, QrTokenStatus } from "@kavtsya/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { act, cleanup, renderHook } from "./support/render-hook";

/**
 * The Customer's QR after a scan (#373). The server consumes a token's `jti`
 * the moment a Purchase earns on it (ADR 0006), so a QR that kept showing it
 * until its expiry timer turned the very next scan into `token_used`. These pin
 * that the hook swaps a used token on its own, and that a failing check never
 * takes the working QR off the screen.
 */

const fetchQrToken = vi.fn<() => Promise<QrTokenResponse>>();
const fetchQrTokenStatus = vi.fn<(jti: string) => Promise<QrTokenStatus>>();
vi.mock("@/lib/api", () => ({ fetchQrToken, fetchQrTokenStatus }));
const appStateListeners: ((state: string) => void)[] = [];
vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (_: string, listener: (state: string) => void) => {
      appStateListeners.push(listener);
      return { remove: vi.fn() };
    },
  },
}));

const { useQrToken } = await import("../src/features/loyalty/use-qr-token");

/** How often the hook asks whether the shown token was used. */
const USED_CHECK_TICK = 4000;

/** A token that won't hit its expiry timer within any test here. */
function issued(n: number): QrTokenResponse {
  return {
    token: `token-${n}`,
    jti: `jti-${n}`,
    expiresAt: new Date(Date.now() + 90_000).toISOString(),
  };
}

async function open() {
  const rendered = renderHook(() => useQrToken());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return rendered;
}

async function elapse(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchQrToken.mockReset();
  fetchQrTokenStatus.mockReset();
  let n = 0;
  fetchQrToken.mockImplementation(async () => issued(++n));
  fetchQrTokenStatus.mockResolvedValue({ used: false });
  appStateListeners.length = 0;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useQrToken", () => {
  it("swaps the token as soon as a scan has used it, without waiting for expiry", async () => {
    const { result } = await open();
    expect(result.current.token).toBe("token-1");

    fetchQrTokenStatus.mockImplementation(async (jti) => ({
      used: jti === "jti-1",
    }));
    await elapse(USED_CHECK_TICK);

    expect(result.current.token).toBe("token-2");
    expect(fetchQrTokenStatus).toHaveBeenLastCalledWith("jti-1");
  });

  it("asks about the new token once it has swapped", async () => {
    const { result } = await open();
    fetchQrTokenStatus.mockResolvedValueOnce({ used: true });
    await elapse(USED_CHECK_TICK);
    expect(result.current.token).toBe("token-2");

    await elapse(USED_CHECK_TICK);

    expect(fetchQrTokenStatus).toHaveBeenLastCalledWith("jti-2");
    expect(result.current.token).toBe("token-2");
  });

  it("keeps showing an unused token", async () => {
    const { result } = await open();

    await elapse(USED_CHECK_TICK * 3);

    expect(result.current.token).toBe("token-1");
    expect(fetchQrToken).toHaveBeenCalledTimes(1);
  });

  it("shows the newest token when two rotations overlap and the older one lands last", async () => {
    const { result } = await open();
    let releaseOlder!: (t: QrTokenResponse) => void;
    fetchQrToken
      .mockImplementationOnce(() => new Promise((r) => (releaseOlder = r)))
      .mockImplementationOnce(async () => issued(3));

    // The used check starts a rotation; the app returns to the foreground
    // while it is still in flight and starts another.
    fetchQrTokenStatus.mockResolvedValueOnce({ used: true });
    await elapse(USED_CHECK_TICK);
    await act(async () => {
      appStateListeners.forEach((listener) => listener("active"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.token).toBe("token-3");

    await act(async () => {
      releaseOlder(issued(2));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.token).toBe("token-3");
    await elapse(USED_CHECK_TICK);
    expect(fetchQrTokenStatus).toHaveBeenLastCalledWith("jti-3");
  });

  it("keeps the current QR and shows no error when the check fails", async () => {
    const { result } = await open();
    fetchQrTokenStatus.mockRejectedValue(new Error("offline"));

    await elapse(USED_CHECK_TICK * 3);

    expect(result.current.token).toBe("token-1");
    expect(result.current.error).toBeNull();
  });
});
