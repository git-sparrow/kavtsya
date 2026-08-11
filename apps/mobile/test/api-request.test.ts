import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The API client's one request seam (#53): every typed endpoint function goes
 * through a single internal `request(path, schema, init)`. These tests drive it
 * through the public endpoint functions rather than the helper itself — the
 * helper is an internal, and what callers rely on is the endpoint contract:
 * a failure throws a *message a screen can show*, and a success is validated
 * against the shared schema before it reaches the app.
 */

const apiFetch = vi.fn();
vi.mock("@/lib/auth-client", () => ({ apiFetch }));

const api = await import("../src/lib/api");

/** What `apiFetch` resolves to on a successful call. */
function ok(data: unknown) {
  return { data, error: null };
}

/**
 * What `apiFetch` resolves to on a failure. Our API's error bodies are
 * `{ error: "<code>" }`, and better-fetch folds the parsed body into the error
 * object alongside its own `message` — so both live on the same value.
 */
function fail(error: { message?: string; error?: string }) {
  return { data: null, error };
}

const ME = {
  id: "user-1",
  email: "olena@example.com",
  name: "Олена",
  roles: ["customer"],
  cafes: [],
  pushConsent: false,
};

const CAFE = {
  id: "6f1b6c9e-5f3a-4a6d-9e2b-1c7d8a0b4e11",
  name: "Кавця",
  plan: "free",
};

beforeEach(() => {
  apiFetch.mockReset();
});

/** The path and wire options the single `apiFetch` call was made with. */
function sentCall(): { path: string; method?: string; body?: unknown } {
  const [path, options] = apiFetch.mock.calls[0] as [
    string,
    { method?: string; body?: unknown } | undefined,
  ];
  return { path, method: options?.method, body: options?.body };
}

describe("request: transport", () => {
  it("sends the path, method and body the endpoint declares", async () => {
    apiFetch.mockResolvedValueOnce(ok(CAFE));

    await api.registerCafe("Кавця");

    expect(sentCall()).toEqual({
      path: "/api/cafes",
      method: "POST",
      body: { name: "Кавця" },
    });
  });

  it("sends a bare GET with no method or body", async () => {
    apiFetch.mockResolvedValueOnce(ok(ME));

    await api.fetchMe();

    expect(sentCall()).toEqual({
      path: "/api/me",
      method: undefined,
      body: undefined,
    });
  });

  it("interpolates path parameters", async () => {
    apiFetch.mockResolvedValueOnce(ok({ threshold: 10, reward: null }));

    await api.fetchProgram("cafe-7");

    expect(sentCall().path).toBe("/api/cafes/cafe-7/program");
  });
});

describe("request: errors", () => {
  it("throws the message the API supplied", async () => {
    apiFetch.mockResolvedValueOnce(fail({ message: "Сесія завершилася" }));

    await expect(api.fetchMe()).rejects.toThrow("Сесія завершилася");
  });

  it("throws the endpoint's own fallback when the API supplied no message", async () => {
    apiFetch.mockResolvedValueOnce(fail({}));

    await expect(api.fetchMe()).rejects.toThrow(
      "Не вдалося завантажити профіль",
    );
  });

  it("gives each endpoint its own fallback message", async () => {
    apiFetch.mockResolvedValue(fail({}));

    await expect(api.fetchBalances()).rejects.toThrow(
      "Не вдалося завантажити зернятка",
    );
    await expect(api.fetchQrToken()).rejects.toThrow(
      "Не вдалося оновити QR-код",
    );
    await expect(api.registerCafe("Кавця")).rejects.toThrow(
      "Не вдалося зареєструвати кав'ярню",
    );
  });

  it("never returns unvalidated data on the error path", async () => {
    // An error body that would also fail the schema: the throw must win, so a
    // screen sees the API's message rather than a Zod parse error.
    apiFetch.mockResolvedValueOnce(fail({ message: "Немає з'єднання" }));

    await expect(api.fetchMe()).rejects.toThrow("Немає з'єднання");
  });
});

describe("request: schema validation", () => {
  it("returns the parsed body on success", async () => {
    apiFetch.mockResolvedValueOnce(ok(ME));

    await expect(api.fetchMe()).resolves.toEqual(ME);
  });

  it("throws when the body does not match the shared schema", async () => {
    // The boundary is the point: a response the API should never send must not
    // reach a screen as a half-typed object.
    apiFetch.mockResolvedValueOnce(ok({ id: "user-1" }));

    await expect(api.fetchMe()).rejects.toThrow();
  });

  it("projects the field the caller actually wants", async () => {
    apiFetch.mockResolvedValueOnce(ok({ memberCode: "K7Q4M2ZX" }));

    await expect(api.fetchMemberCode()).resolves.toBe("K7Q4M2ZX");
  });

  it("resolves with no parsing for an endpoint that returns no body", async () => {
    apiFetch.mockResolvedValueOnce(ok(null));

    await expect(api.endMyShift()).resolves.toBeUndefined();
    expect(sentCall()).toEqual({
      path: "/api/me/shift",
      method: "DELETE",
      body: undefined,
    });
  });
});

describe("request: named rejections", () => {
  it("turns a scan rejection into a typed ScanRejectionError carrying the code", async () => {
    apiFetch.mockResolvedValueOnce(fail({ error: "expired_token" }));

    const thrown = await api
      .issuePurchase("cafe-1", "qr-1")
      .catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(api.ScanRejectionError);
    expect((thrown as InstanceType<typeof api.ScanRejectionError>).code).toBe(
      "expired_token",
    );
  });

  it("names the same taxonomy for the typed member code (#21)", async () => {
    apiFetch.mockResolvedValueOnce(fail({ error: "unknown_member_code" }));

    const thrown = await api
      .issuePurchaseByMemberCode("cafe-1", "K7Q4M2ZX")
      .catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(api.ScanRejectionError);
  });

  it("maps a redemption rejection to its screen copy", async () => {
    apiFetch.mockResolvedValueOnce(fail({ error: "insufficient_balance" }));

    await expect(
      api.confirmRedemption("cafe-1", "user-1", "key-1"),
    ).rejects.toThrow("Недостатньо зернят для винагороди");
  });

  it("maps a campaign rejection to its screen copy", async () => {
    apiFetch.mockResolvedValueOnce(fail({ error: "pro_required" }));

    await expect(api.sendCampaign("cafe-1", "Вітаємо!")).rejects.toThrow(
      "Розсилки доступні на тарифі Pro",
    );
  });

  it("maps the same code to different copy per endpoint", async () => {
    // `pro_required` reads as campaigns on one screen and analytics on another —
    // the copy belongs to the endpoint, not to the code.
    apiFetch.mockResolvedValueOnce(fail({ error: "pro_required" }));

    await expect(api.fetchAnalytics("cafe-1", "7d")).rejects.toThrow(
      "Аналітика доступна на тарифі Pro",
    );
  });

  it("maps the poster scan's one named failure", async () => {
    apiFetch.mockResolvedValueOnce(fail({ error: "unknown_poster" }));

    await expect(api.scanPoster("ABC123")).rejects.toThrow(
      "Такого коду немає — перевірте код на постері кав'ярні",
    );
  });

  it("falls back to the endpoint message for a code it does not name", async () => {
    apiFetch.mockResolvedValueOnce(
      fail({ error: "some_new_server_code", message: "Щось пішло не так" }),
    );

    await expect(api.issuePurchase("cafe-1", "qr-1")).rejects.toThrow(
      "Щось пішло не так",
    );
  });

  it("falls back to the endpoint's own message when a rejection carries none", async () => {
    apiFetch.mockResolvedValueOnce(fail({ error: "some_new_server_code" }));

    await expect(api.issuePurchase("cafe-1", "qr-1")).rejects.toThrow(
      "Не вдалося нарахувати зернятко",
    );
  });
});
