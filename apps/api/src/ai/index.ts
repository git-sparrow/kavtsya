import { z } from "zod";
import { createClaudeProvider } from "./claude";
import type { AIProvider } from "./provider";

export type { AIProvider } from "./provider";

/**
 * Provider selection is an env concern (ADR 0007): `AI_PROVIDER` picks the
 * implementation, `AI_MODEL` the model — swapping either is a config change,
 * not a code change. Claude Haiku is the default (speed + cost). The schema
 * lives here rather than in `env.ts` because only the fortune-generation
 * script needs these variables — the API server never calls the model
 * (ADR 0009) and must not fail to boot over a missing AI key.
 */
const aiEnvSchema = z.object({
  AI_PROVIDER: z.enum(["claude"]).default("claude"),
  AI_MODEL: z.string().min(1).default("claude-haiku-4-5"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
});

export function createAIProvider(
  source: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
): AIProvider {
  const provider = source.AI_PROVIDER ?? "claude";
  if (provider !== "claude") {
    throw new Error(`Unknown AI_PROVIDER "${provider}" — supported: claude`);
  }
  const parsed = aiEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid AI environment: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return createClaudeProvider({
    apiKey: parsed.data.ANTHROPIC_API_KEY,
    model: parsed.data.AI_MODEL,
    fetchImpl,
  });
}
