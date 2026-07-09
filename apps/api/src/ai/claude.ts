import { z } from "zod";
import type { AIProvider } from "./provider";

/**
 * Anthropic Claude implementation of `AIProvider` (ADR 0007): a raw call to
 * the Messages API — deliberately no SDK, so we own the prompt, the error
 * handling, and the response parsing. `fetchImpl` is injected the way `clock`
 * is elsewhere: tests pin the wire contract without touching the network.
 */

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

export interface ClaudeProviderOptions {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}

/**
 * Ворожка's voice: the prompt asks for plain JSON so parsing stays a
 * `JSON.parse`, pins the tone (warm, folk, no clichés) in Ukrainian because
 * the output must be Ukrainian, and carries few-shot examples — the first
 * smoke run (2026-07-09) showed the tone landing but the grammar slipping
 * («швидче», «береги язик»), so the examples anchor clean modern Ukrainian.
 */
const EXAMPLE_FORTUNES = [
  "На дні горнятка — маленька радість, яку ти мало не проґавиш.",
  "Тепла звістка знайде тебе ще до вечора.",
  "Гуща лягла тонкою стежкою — дорога твоя довга, але попутна.",
  "Хтось згадує тебе за кавою просто зараз.",
];

function fortunePrompt(count: number): string {
  return [
    `Згенеруй ${count} коротких кавових ворожінь українською мовою.`,
    "Це передбачення на день, у дусі ворожіння на кавовій гущі: теплі,",
    "трохи загадкові, з народним характером, без банальностей і без емодзі.",
    "Кожне — одне речення, до 120 символів.",
    "Пиши бездоганною сучасною українською: без русизмів, кальок і",
    "вигаданих слів; перевір кожне дієслово.",
    `Ось приклади тону й мови (не повторюй їх дослівно): ${JSON.stringify(EXAMPLE_FORTUNES)}.`,
    "Відповідай ЛИШЕ JSON-масивом рядків, без пояснень і без markdown.",
  ].join(" ");
}

/**
 * Models sometimes fence the JSON in ```json … ``` no matter what the prompt
 * says (seen on the first live Haiku run). Strip an outer fence if present;
 * anything still not a JSON array fails Zod below as before.
 */
function unfence(text: string): string {
  const match = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/.exec(text);
  return match?.[1] ?? text;
}

export function createClaudeProvider({
  apiKey,
  model,
  fetchImpl = fetch,
}: ClaudeProviderOptions): AIProvider {
  return {
    async generateFortunes(count: number): Promise<string[]> {
      const res = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          messages: [{ role: "user", content: fortunePrompt(count) }],
        }),
      });
      if (!res.ok) {
        throw new Error(`Claude Messages API responded ${res.status}`);
      }
      const reply: unknown = await res.json();
      // Models with adaptive thinking (e.g. Sonnet 5) lead with a `thinking`
      // block — the fortunes are in the first `text` block, wherever it sits.
      const { content } = z
        .object({
          content: z.array(
            z.object({ type: z.string(), text: z.string().optional() }),
          ),
        })
        .parse(reply);
      const text = content.find(
        (block) => block.type === "text" && block.text !== undefined,
      )?.text;
      if (text === undefined) {
        throw new Error("Claude reply carried no text block");
      }
      return z.array(z.string().min(1)).parse(JSON.parse(unfence(text)));
    },
  };
}
