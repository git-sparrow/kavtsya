import { createAIProvider } from "../src/ai";
import { loadDotEnv } from "../src/env";

/**
 * Eyeball check of the model's Ukrainian (#23): generate a small batch through
 * the real provider and print it — no database, nothing stored. Run it with an
 * ANTHROPIC_API_KEY in the env and judge the output yourself:
 *
 *   pnpm --filter ./apps/api vorozhka-smoke
 *
 * The prompt lives in src/ai/claude.ts; tweak it there and re-run. This is the
 * seed of the hand-built eval harness — the harness later automates the
 * judgment this script leaves to a native speaker.
 */

loadDotEnv();
const provider = createAIProvider();

const fortunes = await provider.generateFortunes(10);
for (const [i, fortune] of fortunes.entries()) {
  console.log(`${String(i + 1).padStart(2)}. ${fortune}`);
}
