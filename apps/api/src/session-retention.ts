import type { Clock } from "./clock";
import type { Database } from "./db";

/**
 * Session retention (#254, ADR 0018). Better Auth writes the client's IP
 * address and user agent onto every `session` row, and deletes an expired one
 * only when its cookie is presented again (better-auth 1.7.5, checked
 * 2026-09-29). A cookie that never comes back leaves its row forever. On
 * mobile, where people close the app rather than sign out, that is the normal
 * path. Left alone it grows into a per-Customer location-and-device
 * history nobody decided to keep.
 *
 * An expired session is kept at most this long, so a "was my account
 * accessed?" question can still be answered, then deleted. The policy and its reasoning
 * live in ADR 0018; this constant is its enforcement.
 */
export const SESSION_RETENTION_DAYS = 30;

export interface SessionPruneOutcome {
  /** Expired sessions deleted this run. */
  deleted: number;
}

/**
 * Delete every session that expired more than the retention window ago. The
 * cron script wraps it (same rig as `prune-push-receipts`).
 *
 * Only ever touches `session`: a live session (`expiresAt` in the future) is
 * outside the predicate by construction, nothing references a session row, and
 * the user and ledger rows it points at are left alone. Idempotent — a re-run
 * finds nothing left past the cutoff.
 */
export async function pruneExpiredSessions(
  db: Database,
  clock: Clock,
): Promise<SessionPruneOutcome> {
  const deleted = await db`
    delete from "session"
    where "expiresAt" < ${clock.now()}::timestamptz
      - make_interval(days => ${SESSION_RETENTION_DAYS})
  `;
  return { deleted: deleted.count };
}
