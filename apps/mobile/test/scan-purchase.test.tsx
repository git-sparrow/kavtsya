import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, renderHook } from "./support/render-hook";

const apiFetch = vi.fn();
vi.mock("@/lib/auth-client", () => ({ apiFetch }));
const { useScanPurchase } =
  await import("../src/features/scan/use-scan-purchase");
const purchase = {
  customerId: "customer",
  customerName: "Олена",
  balance: 2,
  threshold: 1,
  reward: { type: "free_drink" },
  fortune: "Добрий день",
};
beforeEach(() => apiFetch.mockReset());
afterEach(cleanup);

test.each(["idempotency_conflict", "transport"] as const)(
  "confirmation retry handles %s without losing safe replay",
  async (failure) => {
    apiFetch.mockResolvedValueOnce({ data: purchase, error: null });
    const { result } = renderHook(() => useScanPurchase("cafe"));
    await act(async () => {
      await result.current.onScanned("qr");
    });
    expect(result.current.state.phase).toBe("issued");
    apiFetch.mockResolvedValueOnce({
      data: null,
      error:
        failure === "transport" ? { message: "Offline" } : { error: failure },
    });
    await act(async () => {
      await result.current.confirmRedemption();
    });
    expect(result.current.state.phase).toBe("issued");
    const firstKey = (
      apiFetch.mock.calls[1]![1] as { body: { idempotencyKey: string } }
    ).body.idempotencyKey;
    apiFetch.mockResolvedValueOnce({
      data: { balance: 1, beansSpent: 1, reward: { type: "free_drink" } },
      error: null,
    });
    await act(async () => {
      await result.current.confirmRedemption();
    });
    const retryKey = (
      apiFetch.mock.calls[2]![1] as { body: { idempotencyKey: string } }
    ).body.idempotencyKey;
    if (failure === "idempotency_conflict") expect(retryKey).not.toBe(firstKey);
    else expect(retryKey).toBe(firstKey);
    expect(result.current.state.phase).toBe("redeemed");
  },
);
