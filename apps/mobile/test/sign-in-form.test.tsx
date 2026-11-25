import { act, cleanup, renderHook } from "./support/render-hook";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The sign-in form submits from two places: the button and Return on the
 * password field (#441). Both go through `submit`, so these tests pin what
 * either path does, including that a second submit while one is in flight
 * sends nothing.
 */

const signIn = vi.fn();
const signUp = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { email: signIn }, signUp: { email: signUp } },
}));

const { useSignInForm } =
  await import("../src/features/account/use-sign-in-form");

function fill(
  form: ReturnType<typeof useSignInForm>,
  fields: { name?: string; email: string; password: string },
) {
  act(() => {
    if (fields.name !== undefined) form.setName(fields.name);
    form.setEmail(fields.email);
    form.setPassword(fields.password);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("useSignInForm", () => {
  it("signs in with the typed email and password", async () => {
    signIn.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useSignInForm());
    fill(result.current, { email: "olia@example.com", password: "secret12" });

    await act(() => result.current.submit());

    expect(signIn).toHaveBeenCalledWith({
      email: "olia@example.com",
      password: "secret12",
    });
    expect(result.current.error).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it("shows the server's refusal", async () => {
    signIn.mockResolvedValue({ error: { message: "Невірний пароль" } });
    const { result } = renderHook(() => useSignInForm());
    fill(result.current, { email: "olia@example.com", password: "wrong" });

    await act(() => result.current.submit());

    expect(result.current.error).toBe("Невірний пароль");
  });

  it("sends one request when submitted again while the first is in flight", async () => {
    let finish!: (value: { error: null }) => void;
    signIn.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useSignInForm());
    fill(result.current, { email: "olia@example.com", password: "secret12" });

    let first!: Promise<void>;
    await act(async () => {
      first = result.current.submit();
      // Return pressed twice in one frame: no re-render in between.
      void result.current.submit();
    });
    expect(result.current.busy).toBe(true);

    await act(async () => {
      finish({ error: null });
      await first;
    });

    expect(signIn).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(false);
  });

  it("signs up with the name in sign-up mode", async () => {
    signUp.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useSignInForm());
    act(() => result.current.toggleMode());
    fill(result.current, {
      name: "Оля",
      email: "olia@example.com",
      password: "secret12",
    });

    await act(() => result.current.submit());

    expect(signUp).toHaveBeenCalledWith({
      name: "Оля",
      email: "olia@example.com",
      password: "secret12",
    });
    expect(signIn).not.toHaveBeenCalled();
  });
});
