import { act, cleanup, renderHook } from "./support/render-hook";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useScreenAction } from "@/lib/use-screen-action";

/**
 * One error line per screen, from one implementation (#190). Three screens had
 * derived this separately; what matters is that the merged version still keeps
 * each of their promises — the user's own refusal speaks first, a failed refresh
 * still surfaces on a board that re-reads, and a stale read error stops nagging
 * the CafeOwner who has moved on to editing.
 */

/** Stands in for whatever `useApiResource` last returned. */
function read(error: string | null) {
  return { error };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useScreenAction: the one error line", () => {
  it("shows the read's error when the user has done nothing", () => {
    const { result } = renderHook(() => useScreenAction(read("Немає мережі")));

    expect(result.current.error).toBe("Немає мережі");
  });

  it("lets the user's own failure speak over the read's", async () => {
    const { result } = renderHook(() => useScreenAction(read("Немає мережі")));

    await act(() =>
      result.current.run(
        () => Promise.reject(new Error("Не вдалося завершити зміну")),
        "fallback",
      ),
    );

    expect(result.current.error).toBe("Не вдалося завершити зміну");
  });

  it("falls back when the failure carries no message of its own", async () => {
    const { result } = renderHook(() => useScreenAction(read(null)));

    await act(() =>
      result.current.run(
        () => Promise.reject("a bare string"),
        "Не вдалося видалити бариста",
      ),
    );

    expect(result.current.error).toBe("Не вдалося видалити бариста");
  });

  it("reads a refusal exactly as it reads a failure", () => {
    const { result } = renderHook(() => useScreenAction(read(null)));

    act(() => result.current.refuse("Поріг має бути цілим числом від 1"));

    expect(result.current.error).toBe("Поріг має бути цілим числом від 1");
  });

  it("clears the previous refusal when the next action starts", async () => {
    const { result } = renderHook(() => useScreenAction(read(null)));
    act(() => result.current.refuse("Заповніть деталі винагороди"));

    await act(() => result.current.run(() => Promise.resolve(), "fallback"));

    expect(result.current.error).toBeNull();
  });

  it("still surfaces a read error after a successful action", async () => {
    // The Barista Roster re-reads after every action. If approving works but
    // the refresh behind it fails, the owner is looking at a stale board and
    // must be told — so acting cannot be what silences the read.
    const { result, rerender } = renderHook<
      ReturnType<typeof useScreenAction>,
      { error: string | null }
    >(({ error }) => useScreenAction(read(error)), {
      initialProps: { error: null },
    });

    await act(() => result.current.run(() => Promise.resolve(), "fallback"));
    rerender({ error: "Не вдалося завантажити ростер" });

    expect(result.current.error).toBe("Не вдалося завантажити ростер");
  });

  it("stops showing a read error the user has explicitly moved past", () => {
    // The program editor reads once. Once the CafeOwner starts typing, "не
    // вдалося завантажити" describes a moment they have left behind.
    const { result } = renderHook(() =>
      useScreenAction(read("Помилка завантаження")),
    );

    act(() => result.current.clear());

    expect(result.current.error).toBeNull();
  });

  it("dismisses the message on screen, not every message after it", () => {
    // Waving one failure away must not sign the reader up to never hear about
    // the next: the resource behind this re-reads, and a read that fails AFTER
    // the dismissal is news.
    const { result, rerender } = renderHook<
      ReturnType<typeof useScreenAction>,
      { error: string | null }
    >(({ error }) => useScreenAction(read(error)), {
      initialProps: { error: "Помилка завантаження" },
    });
    act(() => result.current.clear());

    rerender({ error: null });
    rerender({ error: "Не вдалося завантажити ростер" });

    expect(result.current.error).toBe("Не вдалося завантажити ростер");
  });
});

describe("useScreenAction: busy", () => {
  it("is true only while the action is in flight", async () => {
    const { result } = renderHook(() => useScreenAction(read(null)));
    expect(result.current.busy).toBe(false);

    let finish!: () => void;
    const work = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let running!: Promise<void>;
    act(() => {
      running = result.current.run(() => work, "fallback");
    });
    expect(result.current.busy).toBe(true);

    await act(async () => {
      finish();
      await running;
    });

    expect(result.current.busy).toBe(false);
  });

  it("comes back down when the action fails", async () => {
    const { result } = renderHook(() => useScreenAction(read(null)));

    await act(() =>
      result.current.run(() => Promise.reject(new Error("Ні")), "fallback"),
    );

    expect(result.current.busy).toBe(false);
  });

  it("never rejects, so a fire-and-forget action cannot leak", async () => {
    const { result } = renderHook(() => useScreenAction(read(null)));

    await act(async () => {
      await expect(
        result.current.run(() => Promise.reject(new Error("Ні")), "fallback"),
      ).resolves.toBeUndefined();
    });
  });
});
