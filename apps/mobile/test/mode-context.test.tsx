import { act, cleanup, renderHook, waitFor } from "./support/render-hook";
import type { MeResponse, Shift } from "@kavtsya/shared";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the app does when it cannot find out whether you are on shift (#187).
 *
 * The read failing used to be indistinguishable from the read being in flight,
 * and the home screen spun on that forever. It now settles — which means the
 * Mode is derived from an *assumption*, and these tests pin both halves of the
 * bargain: the app never strands the user, and it never quietly pretends the
 * assumption was an answer.
 *
 * `expo-router` is stubbed as in `use-api-resource.test.tsx`: importing it drags
 * in the untransformed React Native source tree, and what focus itself does is
 * React Navigation's guarantee, not ours.
 */
vi.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    useEffect(callback, [callback]);
  },
}));

const fetchMe = vi.fn<() => Promise<MeResponse>>();
const fetchMyShift = vi.fn<() => Promise<Shift | null>>();
vi.mock("@/lib/api", () => ({
  fetchMe: () => fetchMe(),
  fetchMyShift: () => fetchMyShift(),
}));

const { MeProvider } = await import("@/features/account/me-context");
const { ModeProvider, useMode } = await import("@/features/mode/mode-context");

const CUSTOMER: MeResponse = {
  id: "u1",
  email: "barista@kavtsya.test",
  name: "Оля",
  roles: ["customer"],
  cafes: [],
  pushConsent: false,
};

const SHIFT: Shift = {
  cafeId: "11111111-1111-1111-1111-111111111111",
  cafeName: "Кавця на Січових",
  expiresAt: "2026-08-21T18:00:00.000Z",
};

function Providers({ children }: { children: ReactNode }) {
  return (
    <MeProvider>
      <ModeProvider>{children}</ModeProvider>
    </MeProvider>
  );
}

/** Mounts `useMode` under both providers, the way the dispatcher reads it. */
function renderMode() {
  return renderHook(() => useMode(), { wrapper: Providers });
}

beforeEach(() => {
  fetchMe.mockResolvedValue(CUSTOMER);
  fetchMyShift.mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ModeProvider: when the shift check fails", () => {
  it("settles instead of holding the app on a spinner", async () => {
    fetchMyShift.mockRejectedValue(new Error("Не вдалося перевірити зміну"));

    const { result } = renderMode();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.mode).toBe("customer");
  });

  it("still derives the CafeOwner's own default Mode", async () => {
    fetchMe.mockResolvedValue({
      ...CUSTOMER,
      roles: ["customer", "cafe_owner"],
    });
    fetchMyShift.mockRejectedValue(new Error("Не вдалося перевірити зміну"));

    const { result } = renderMode();

    await waitFor(() => expect(result.current.mode).toBe("owner"));
  });

  it("says why, rather than passing the failure off as 'off duty'", async () => {
    fetchMyShift.mockRejectedValue(new Error("Не вдалося перевірити зміну"));

    const { result } = renderMode();

    await waitFor(() =>
      expect(result.current.shiftError).toBe("Не вдалося перевірити зміну"),
    );
    // The pair the dispatcher reads: no shift to show, and a reason for it.
    expect(result.current.shift).toBeNull();
  });

  it("clears the reason and hands over Scanner Mode when the retry lands", async () => {
    fetchMyShift.mockRejectedValueOnce(
      new Error("Не вдалося перевірити зміну"),
    );
    const { result } = renderMode();
    await waitFor(() => expect(result.current.shiftError).not.toBeNull());

    fetchMyShift.mockResolvedValue(SHIFT);
    await act(() => result.current.reloadShift());

    expect(result.current.shiftError).toBeNull();
    expect(result.current.mode).toBe("scanner");
  });

  it("announces nothing ended: a failed check is not a shift ending", async () => {
    fetchMyShift.mockResolvedValueOnce(SHIFT);
    const { result } = renderMode();
    await waitFor(() => expect(result.current.mode).toBe("scanner"));

    fetchMyShift.mockRejectedValue(new Error("Не вдалося перевірити зміну"));
    await act(() => result.current.reloadShift());

    // The shift on screen is the last real answer, so the barista keeps the
    // scanner and hears no «зміну завершено» that never happened.
    expect(result.current.mode).toBe("scanner");
    expect(result.current.endedNotice).toBeNull();
  });
});
