import { systemClock } from "../src/clock";
import { createDb } from "../src/db";
import { loadDatabaseUrl, loadDotEnv } from "../src/env";
import {
  pruneExpiredSessions,
  SESSION_RETENTION_DAYS,
} from "../src/session-retention";

/**
 * Session retention (#254, ADR 0018), meant to run daily on Railway cron — the
 * same rig as the Ворожка batch and `prune-push-receipts`, scheduled once #65
 * provisions production. Deletes sessions that
 * expired more than the retention window ago, and with them the IP address and
 * user agent Better Auth stored. Idempotent: a re-run finds nothing past the
 * cutoff. Needs DATABASE_URL.
 */

loadDotEnv();

const db = createDb(loadDatabaseUrl());

try {
  const { deleted } = await pruneExpiredSessions(db, systemClock);
  console.log(
    `Sessions: ${deleted} expired more than ${SESSION_RETENTION_DAYS} days ago deleted`,
  );
} finally {
  await db.end();
}
