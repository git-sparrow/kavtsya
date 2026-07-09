import { describe, expect, it } from "vitest";
import { createClaudeProvider } from "../src/ai/claude";
import { createAIProvider } from "../src/ai";

/**
 * The AIProvider seam (#23, ADR 0007): Ворожка's only contact with a live
 * model. `fetch` is injected like `clock` is elsewhere, so these tests pin the
 * wire contract with Anthropic without any network — the daily job and the
 * scan path are tested against a fake provider and never see this code.
 */

/** A fetch stub that records the request and returns a canned Messages API reply. */
function fetchReturning(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  /** The JSON body of the one request the provider was expected to make. */
  function sentBody(): Record<string, unknown> {
    expect(calls).toHaveLength(1);
    return JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
  }
  return { calls, fetchImpl, sentBody };
}

/** The shape a successful Messages API reply carries the fortunes in. */
function messagesReply(fortunes: string[]) {
  return { content: [{ type: "text", text: JSON.stringify(fortunes) }] };
}

describe("ClaudeProvider", () => {
  it("asks the Messages API for the batch with the configured model and auth", async () => {
    const { calls, fetchImpl, sentBody } = fetchReturning(
      messagesReply(["Ворожба!"]),
    );
    const provider = createClaudeProvider({
      apiKey: "sk-ant-test-key",
      model: "claude-haiku-4-5",
      fetchImpl,
    });

    await provider.generateFortunes(20);

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe("https://api.anthropic.com/v1/messages");
    expect(call.init.method).toBe("POST");
    const headers = new Headers(call.init.headers);
    expect(headers.get("x-api-key")).toBe("sk-ant-test-key");
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
    expect(headers.get("content-type")).toBe("application/json");
    const body = sentBody();
    expect(body.model).toBe("claude-haiku-4-5");
    expect(body.max_tokens).toBeGreaterThan(0);
    // The prompt must carry the batch size — 20 fortunes, not a default.
    expect(JSON.stringify(body.messages)).toContain("20");
  });

  it("returns the fortunes parsed out of the reply text", async () => {
    const fortunes = [
      "Кава сьогодні тепліша, ніж здається.",
      "На дні — добра звістка.",
    ];
    const { fetchImpl } = fetchReturning(messagesReply(fortunes));
    const provider = createClaudeProvider({
      apiKey: "k",
      model: "claude-haiku-4-5",
      fetchImpl,
    });

    await expect(provider.generateFortunes(2)).resolves.toEqual(fortunes);
  });

  it("reports an API error by status instead of trying to parse the body", async () => {
    const { fetchImpl } = fetchReturning(
      {
        type: "error",
        error: { type: "rate_limit_error", message: "slow down" },
      },
      429,
    );
    const provider = createClaudeProvider({
      apiKey: "k",
      model: "claude-haiku-4-5",
      fetchImpl,
    });

    await expect(provider.generateFortunes(5)).rejects.toThrow(/429/);
  });

  it("rejects a reply whose text is not a JSON array of fortunes", async () => {
    const { fetchImpl } = fetchReturning({
      content: [{ type: "text", text: "Ось ваші ворожіння: 1. ..." }],
    });
    const provider = createClaudeProvider({
      apiKey: "k",
      model: "claude-haiku-4-5",
      fetchImpl,
    });

    await expect(provider.generateFortunes(5)).rejects.toThrow();
  });
});

describe("createAIProvider", () => {
  it("defaults to Claude Haiku when AI_PROVIDER/AI_MODEL are unset", async () => {
    const { fetchImpl, sentBody } = fetchReturning(messagesReply(["..."]));
    const provider = createAIProvider(
      { ANTHROPIC_API_KEY: "sk-ant-test-key" },
      fetchImpl,
    );

    await provider.generateFortunes(1);

    expect(sentBody().model).toBe("claude-haiku-4-5");
  });

  it("honours an AI_MODEL override without a code change (ADR 0007)", async () => {
    const { fetchImpl, sentBody } = fetchReturning(messagesReply(["..."]));
    const provider = createAIProvider(
      {
        AI_PROVIDER: "claude",
        AI_MODEL: "claude-sonnet-5",
        ANTHROPIC_API_KEY: "sk-ant-test-key",
      },
      fetchImpl,
    );

    await provider.generateFortunes(1);

    expect(sentBody().model).toBe("claude-sonnet-5");
  });

  it("rejects an unknown AI_PROVIDER by name", () => {
    expect(() =>
      createAIProvider({ AI_PROVIDER: "gpt", ANTHROPIC_API_KEY: "k" }),
    ).toThrow(/gpt/);
  });

  it("refuses to build the Claude provider without an API key", () => {
    expect(() => createAIProvider({})).toThrow(/ANTHROPIC_API_KEY/);
  });
});
