import { z } from "zod";
import { createAIProvider } from "../src/ai";
import { systemClock } from "../src/clock";
import { createDb } from "../src/db";
import { loadDatabaseUrl, loadDotEnv } from "../src/env";
import { DAILY_BATCH_SIZE, generateDailyFortunes } from "../src/fortunes";

/**
 * The daily Ворожка batch (#23, ADR 0009), invoked by Railway cron (early
 * morning Europe/Kyiv). Idempotent — a re-run on the same Kyiv day is a no-op,
 * so a retry after a partial failure is always safe. Needs DATABASE_URL and
 * ANTHROPIC_API_KEY (plus optional AI_PROVIDER / AI_MODEL, ADR 0007, and
 * FORTUNES_BATCH_SIZE).
 */

loadDotEnv();

/**
 * Batch size is the AI-spend knob, so it's env config rather than code: change
 * the variable where the cron runs and the next run picks it up. It only
 * shapes *future* batches — a day whose pool already exists is never topped up.
 */
const batchEnv = z
  .object({
    FORTUNES_BATCH_SIZE: z.coerce
      .number()
      .int()
      .positive()
      .default(DAILY_BATCH_SIZE),
  })
  .safeParse(process.env);
if (!batchEnv.success) {
  throw new Error(
    `Invalid FORTUNES_BATCH_SIZE "${process.env.FORTUNES_BATCH_SIZE}" — must be a positive integer (default ${DAILY_BATCH_SIZE})`,
  );
}
const { FORTUNES_BATCH_SIZE } = batchEnv.data;

const db = createDb(loadDatabaseUrl());

try {
  await generateDailyFortunes(db, {
    provider: createAIProvider(),
    clock: systemClock,
    count: FORTUNES_BATCH_SIZE,
  });
  console.log("Ворожка pool ready for today (Europe/Kyiv)");
} finally {
  await db.end();
}
