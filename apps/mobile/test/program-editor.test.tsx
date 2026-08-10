import { act, cleanup, renderHook, waitFor } from "./support/render-hook";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The program editor (#18) now reads its café through `useApiResource` (#53),
 * which owns the read's error separately from the CafeOwner's own validation and
 * save failures. The screen still shows ONE error line, so these tests pin how
 * the two fold back together — in particular that a failed read is dismissed by
 * touching the form, the way it was when a single error slot held both.
 */

const fetchProgram = vi.fn();
const fetchRewardDefaults = vi.fn();
const updateProgram = vi.fn();

vi.mock("@/lib/api", () => ({
  fetchProgram,
  fetchRewardDefaults,
  updateProgram,
}));
vi.mock("expo-router", () => ({ useFocusEffect: () => {} }));

const { useProgramEditor } =
  await import("../src/features/loyalty/use-program-editor");

const DEFAULTS = [
  { type: "free_drink" as const, label: "Безкоштовний напій" },
  { type: "fixed_discount" as const, label: "Фіксована знижка" },
];

function loads(threshold: number, reward: unknown = null) {
  fetchProgram.mockResolvedValue({ threshold, reward });
  fetchRewardDefaults.mockResolvedValue(DEFAULTS);
}

/** Renders the editor and waits for its first read to settle. */
async function open(cafeId = "cafe-1") {
  const rendered = renderHook(() => useProgramEditor(cafeId));
  await waitFor(() => expect(rendered.result.current.loading).toBe(false));
  return rendered;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("loading the café's program", () => {
  it("seeds the form from the server and offers the platform defaults", async () => {
    loads(7, { type: "free_drink" });
    const { result } = await open();

    expect(result.current.threshold).toBe("7");
    expect(result.current.rewardType).toBe("free_drink");
    expect(result.current.defaults).toEqual(DEFAULTS);
  });

  it("does not overwrite edits the CafeOwner already made", async () => {
    loads(7);
    const { result, rerender } = await open();

    act(() => result.current.editThreshold("12"));
    rerender();

    expect(result.current.threshold).toBe("12");
  });
});

describe("the one error line", () => {
  it("shows a failed read", async () => {
    fetchProgram.mockRejectedValue(
      new Error("Не вдалося завантажити програму"),
    );
    fetchRewardDefaults.mockResolvedValue(DEFAULTS);
    const { result } = await open();

    expect(result.current.error).toBe("Не вдалося завантажити програму");
  });

  it("dismisses a failed read as soon as the CafeOwner touches the form", async () => {
    // Without this the strip would pin itself to the screen for good: the editor
    // exposes no retry, so nothing else would ever clear it.
    fetchProgram.mockRejectedValue(
      new Error("Не вдалося завантажити програму"),
    );
    fetchRewardDefaults.mockResolvedValue(DEFAULTS);
    const { result } = await open();

    act(() => result.current.stepThreshold(1));

    expect(result.current.error).toBeNull();
  });

  it("shows a validation refusal instead of saving", async () => {
    loads(5);
    const { result } = await open();

    act(() => result.current.editThreshold("0"));
    await act(() => result.current.save());

    expect(result.current.error).toBe("Поріг має бути цілим числом від 1");
    expect(updateProgram).not.toHaveBeenCalled();
  });

  it("clears a validation refusal on the next edit", async () => {
    loads(5);
    const { result } = await open();

    act(() => result.current.editThreshold("0"));
    await act(() => result.current.save());
    act(() => result.current.editThreshold("6"));

    expect(result.current.error).toBeNull();
  });

  it("shows why a save failed", async () => {
    loads(5);
    updateProgram.mockRejectedValue(new Error("Не вдалося зберегти програму"));
    const { result } = await open();

    await act(() => result.current.save());

    expect(result.current.error).toBe("Не вдалося зберегти програму");
    expect(result.current.saved).toBe(false);
  });
});

describe("saving", () => {
  it("writes the form and re-seeds from what the server stored", async () => {
    loads(5);
    updateProgram.mockResolvedValue({ threshold: 8, reward: null });
    const { result } = await open();

    act(() => result.current.editThreshold("8"));
    await act(() => result.current.save());

    expect(updateProgram).toHaveBeenCalledWith("cafe-1", {
      threshold: 8,
      reward: null,
    });
    expect(result.current.saved).toBe(true);
    expect(result.current.threshold).toBe("8");
  });

  it("drops the saved confirmation the moment editing resumes", async () => {
    loads(5);
    updateProgram.mockResolvedValue({ threshold: 5, reward: null });
    const { result } = await open();

    await act(() => result.current.save());
    act(() => result.current.editThreshold("9"));

    expect(result.current.saved).toBe(false);
  });
});
