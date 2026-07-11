import { createDb } from "../src/db";
import { loadDatabaseUrl, loadDotEnv } from "../src/env";
import { createPushProvider } from "../src/push";
import { prunePushReceipts } from "../src/push-receipts";

/**
 * Push-receipt hygiene (#24), invoked by Railway cron shortly after typical
 * sending hours — the second consumer of the same cron rig as the Ворожка
 * batch. Idempotent — re-runs only ever look at the still-unresolved backlog.
 * Needs DATABASE_URL (plus optional EXPO_ACCESS_TOKEN).
 */

loadDotEnv();

const db = createDb(loadDatabaseUrl());

try {
  const { resolved, deactivated } = await prunePushReceipts(
    db,
    createPushProvider(),
  );
  console.log(
    `Push receipts: ${resolved} resolved, ${deactivated} dead token(s) deactivated`,
  );
} finally {
  await db.end();
}
