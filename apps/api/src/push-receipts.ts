import type { Database } from "./db";
import type { PushProvider } from "./push";

/**
 * Receipt hygiene (#24): Expo answers a send with tickets NOW and verdicts
 * ~15 minutes LATER — and `DeviceNotRegistered` verdicts must deactivate their
 * tokens, or Expo throttles the whole platform's sending. This resolves the
 * unresolved-ticket backlog; the cron script wraps it (same rig as the daily
 * Ворожка batch).
 *
 * Idempotent and safe to re-run: a resolved ticket never re-enters the
 * backlog, and a receipt Expo hasn't produced yet simply stays pending for
 * the next run.
 */

export interface PruneOutcome {
  /** Tickets whose receipt arrived and was applied this run. */
  resolved: number;
  /** Tokens deactivated because their device is gone. */
  deactivated: number;
}

export async function prunePushReceipts(
  db: Database,
  provider: PushProvider,
): Promise<PruneOutcome> {
  const backlog = await db<
    { id: string; ticket_id: string; push_token_id: string }[]
  >`
    select "id", "ticket_id", "push_token_id"
    from push_tickets
    where "resolved_at" is null
    order by "created_at" asc
  `;
  if (backlog.length === 0) return { resolved: 0, deactivated: 0 };

  const receipts = await provider.fetchReceipts(
    backlog.map((t) => t.ticket_id),
  );

  let resolved = 0;
  let deactivated = 0;
  for (const ticket of backlog) {
    const receipt = receipts[ticket.ticket_id];
    if (!receipt) continue; // not ready yet — next run's problem

    if (receipt.status === "error" && receipt.error === "DeviceNotRegistered") {
      await db`
        update push_tokens set "active" = false, "updated_at" = now()
        where "id" = ${ticket.push_token_id}
      `;
      deactivated++;
    }
    await db`
      update push_tickets set "resolved_at" = now() where "id" = ${ticket.id}
    `;
    resolved++;
  }

  return { resolved, deactivated };
}
