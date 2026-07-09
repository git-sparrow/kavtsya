import { createAIProvider } from "../src/ai";
import { systemClock } from "../src/clock";
import { createDb } from "../src/db";
import { loadDatabaseUrl, loadDotEnv } from "../src/env";
import { generateDailyFortunes } from "../src/fortunes";

/**
 * The daily Ворожка batch (#23, ADR 0009), invoked by Railway cron (early
 * morning Europe/Kyiv). Idempotent — a re-run on the same Kyiv day is a no-op,
 * so a retry after a partial failure is always safe. Needs DATABASE_URL and
 * ANTHROPIC_API_KEY (plus optional AI_PROVIDER / AI_MODEL, ADR 0007).
 */

loadDotEnv();
const db = createDb(loadDatabaseUrl());

try {
  await generateDailyFortunes(db, {
    provider: createAIProvider(),
    clock: systemClock,
  });
  console.log("Ворожка pool ready for today (Europe/Kyiv)");
} finally {
  await db.end();
}
