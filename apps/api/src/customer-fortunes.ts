import type { PendingFortune } from "@kavtsya/shared";
import type { Database, Queryable } from "./db";
import { programFromRow } from "./loyalty";
import { balanceFor } from "./purchases";

/**
 * The Customer's own Ворожка reveals (#23, redesign turn 1). The ritual moved
 * off the barista's screen and onto the Customer's device: each scan draws a
 * fortune (the daily pool, ADR 0009) and records it here so the Customer's phone
 * can reveal it. This module is the only interface to `customer_fortunes`.
 */

/**
 * Persist the fortune a scan drew, against the Customer and the Café. Called on
 * the Purchase path — best-effort, since the Зернятко is already issued and the
 * reveal must never be able to fail a scan.
 */
export async function recordFortune(
  db: Queryable,
  {
    customerId,
    cafeId,
    fortune,
  }: { customerId: string; cafeId: string; fortune: string },
): Promise<void> {
  await db`
    insert into customer_fortunes ("customer_user_id", "cafe_id", "fortune")
    values (${customerId}, ${cafeId}, ${fortune})
  `;
}

/**
 * The Customer's most recent unrevealed fortune, with the scan's Зернятко
 * context (Café name, current balance, threshold, Reward) so the reveal can
 * render the bean-row card and its reward-ready variant — or null when there is
 * nothing to reveal. Balance and program are read live, so a reveal that opens
 * seconds after the scan reflects the ledger as it stands.
 */
export async function pendingFortuneFor(
  db: Database,
  customerId: string,
): Promise<PendingFortune | null> {
  const [row] = await db<
    {
      id: string;
      fortune: string;
      cafe_id: string;
      cafe_name: string;
      zernyatko_threshold: number;
      reward: unknown;
    }[]
  >`
    select
      f."id", f."fortune", f."cafe_id",
      c."name" as cafe_name, c."zernyatko_threshold", c."reward"
    from customer_fortunes f
    join cafes c on c."id" = f."cafe_id"
    where f."customer_user_id" = ${customerId} and f."seen_at" is null
    order by f."created_at" desc
    limit 1
  `;
  if (!row) return null;
  const program = programFromRow(row);
  return {
    id: row.id,
    fortune: row.fortune,
    cafeId: row.cafe_id,
    cafeName: row.cafe_name,
    balance: await balanceFor(db, customerId, row.cafe_id),
    threshold: program.threshold,
    reward: program.reward,
  };
}

/**
 * Mark a fortune revealed (the «Дякую» tap). Scoped to the owning Customer, so
 * no one can clear another Customer's reveal, and only if still unseen.
 */
export async function markFortuneSeen(
  db: Database,
  customerId: string,
  id: string,
): Promise<void> {
  await db`
    update customer_fortunes set "seen_at" = now()
    where "id" = ${id}
      and "customer_user_id" = ${customerId}
      and "seen_at" is null
  `;
}
