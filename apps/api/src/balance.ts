/**
 * Зернятко balance derivation (ADR 0010). The ledger is the source of truth;
 * balance is always computed as count(purchases) − sum(redemptions.beans_spent),
 * never stored as a mutable counter. This pure seam holds the formula; the SQL
 * layer feeds it the two aggregates (beansSpent is 0 until Redemption, #22).
 */

export interface LedgerTotals {
  /** count(purchases) for the (Customer, Café) pair — one row per Зернятко. */
  purchases: number;
  /** sum(redemptions.beans_spent) for the same pair. */
  beansSpent: number;
}

export function deriveBalance({ purchases, beansSpent }: LedgerTotals): number {
  return purchases - beansSpent;
}
