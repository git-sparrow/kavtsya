import type { Reward } from "@kavtsya/shared";
import { isRedemptionReady, rewardSchema } from "@kavtsya/shared";
import type { Database, Queryable } from "./db";
import { isUniqueViolation } from "./db";
import { balanceFor } from "./purchases";
import { authorizeCounter } from "./shifts";

/**
 * Confirming a Redemption — the spend side of the ledger (#22, ADR 0010). One
 * validated scan already identified the Customer (ADR 0006: no second token);
 * the CafeOwner's confirm appends one immutable `redemptions` row snapshotting
 * `beans_spent` (= the threshold at confirm time) and the Reward, so later
 * program changes never re-price history.
 *
 * Concurrency: the check-and-write runs in one transaction holding a
 * `FOR UPDATE` lock on the (Customer, Café) membership row, so two concurrent
 * confirms serialize — the second re-reads the balance after the first commits
 * and is rejected instead of overdrawing. The idempotency key handles the
 * *retry* case instead: the same key replays the original outcome.
 */

export interface ConfirmRedemptionInput {
  /** The Café the confirm happens at. */
  cafeId: string;
  /** Who is confirming (`user.id`): the owner or an active grant holder (ADR 0013). */
  actorUserId: string;
  /** The Customer the scan identified (`PurchaseResult.customerId`). */
  customerId: string;
  /** Minted per confirm tap; a retry reuses it, a banked second confirm doesn't. */
  idempotencyKey: string;
  /** The confirm's instant — the grant-expiry check runs on the injected clock. */
  now: Date;
}

/** Why confirming was refused — the wire mapping is exhaustive over it (#50). */
export type ConfirmRedemptionRejection =
  | "cafe_not_owned"
  | "own_cafe"
  | "insufficient_balance"
  | "no_reward";

export type ConfirmRedemptionOutcome =
  | {
      ok: true;
      /** True when this key was already confirmed — the stored outcome, not a new spend. */
      replayed: boolean;
      balance: number;
      beansSpent: number;
      reward: Reward;
    }
  | { ok: false; reason: ConfirmRedemptionRejection };

/**
 * Whether a confirm is allowed (CONTEXT → Redemption): the balance must meet
 * the Café's threshold and the Café must have a Reward to claim. Carries the
 * Reward through on success, so an eligible Redemption provably has one.
 */
export function redemptionEligibility({
  balance,
  threshold,
  reward,
}: {
  balance: number;
  threshold: number;
  reward: Reward | null;
}):
  | { eligible: true; reward: Reward }
  | {
      eligible: false;
      reason: Extract<
        ConfirmRedemptionRejection,
        "insufficient_balance" | "no_reward"
      >;
    } {
  if (!reward) return { eligible: false, reason: "no_reward" };
  // `reward` is non-null here, so the shared rule reduces to the balance check —
  // one predicate shared with the mobile clients, one API-specific reason.
  if (!isRedemptionReady({ balance, threshold, reward })) {
    return { eligible: false, reason: "insufficient_balance" };
  }
  return { eligible: true, reward };
}

/**
 * The subtract-threshold rule (CONTEXT → Redemption): a confirm spends exactly
 * the threshold at confirm time — that is the snapshot `beans_spent` — and the
 * leftover Зернятка remain (balance 23, threshold 10 → 13; never reset to 0).
 */
export function applyRedemption({
  balance,
  threshold,
}: {
  balance: number;
  threshold: number;
}): { beansSpent: number; balance: number } {
  return { beansSpent: threshold, balance: balance - threshold };
}

export async function confirmRedemption(
  db: Database,
  {
    cafeId,
    actorUserId,
    customerId,
    idempotencyKey,
    now,
  }: ConfirmRedemptionInput,
): Promise<ConfirmRedemptionOutcome> {
  // Confirm is the shift's second counter power (ADR 0013): the same
  // counter-authorization rule as issuing, decided once in the Shift module
  // (#111). Confirm leaves scanner ≠ scanned off — a confirm to one's own code
  // is already caught by the own-café guard, which both paths share.
  const auth = await authorizeCounter(db, {
    cafeId,
    actorUserId,
    customerId,
    now,
    rejectSelfScan: false,
  });
  if (!auth.ok) return { ok: false, reason: auth.reason };

  const program = auth.program;

  return db.begin(async (tx): Promise<ConfirmRedemptionOutcome> => {
    // The lock target (ADR 0010). No membership row means no Purchase ever
    // landed here, so the balance is 0 — nothing to lock, nothing to spend.
    const [membership] = await tx`
      select 1 as locked from cafe_memberships
      where "cafe_id" = ${cafeId} and "customer_user_id" = ${customerId}
      for update
    `;
    if (!membership) return { ok: false, reason: "insufficient_balance" };

    // Replay check under the lock: a retry that lost the race to its original
    // sees the committed row here (READ COMMITTED re-reads after the wait).
    const prior = await replayFor(tx, idempotencyKey, customerId, cafeId);
    if (prior) return prior;

    const balance = await balanceFor(tx, customerId, cafeId);
    const eligibility = redemptionEligibility({
      balance,
      threshold: program.threshold,
      reward: program.reward,
    });
    if (!eligibility.eligible) return { ok: false, reason: eligibility.reason };

    const spent = applyRedemption({ balance, threshold: program.threshold });
    try {
      await tx`
        insert into redemptions
          ("cafe_id", "customer_user_id", "beans_spent", "reward", "idempotency_key")
        values
          (${cafeId}, ${customerId}, ${spent.beansSpent},
           ${tx.json(eligibility.reward)}, ${idempotencyKey})
      `;
    } catch (err) {
      // Same key raced past the replay check in another transaction after the
      // lock ordering above couldn't help (e.g. a different membership row).
      if (isUniqueViolation(err)) {
        const replay = await replayFor(tx, idempotencyKey, customerId, cafeId);
        if (replay) return replay;
      }
      throw err;
    }

    return {
      ok: true,
      replayed: false,
      balance: spent.balance,
      beansSpent: spent.beansSpent,
      reward: eligibility.reward,
    };
  });
}

/**
 * The stored outcome for an idempotency key already confirmed: the snapshotted
 * spend plus the *current* derived balance (the retry may arrive after further
 * Purchases). Null when the key is unused.
 */
async function replayFor(
  tx: Queryable,
  idempotencyKey: string,
  customerId: string,
  cafeId: string,
): Promise<Extract<ConfirmRedemptionOutcome, { ok: true }> | null> {
  const [row] = await tx<{ beans_spent: number; reward: unknown }[]>`
    select "beans_spent", "reward" from redemptions
    where "idempotency_key" = ${idempotencyKey}
      and "cafe_id" = ${cafeId} and "customer_user_id" = ${customerId}
  `;
  if (!row) return null;
  return {
    ok: true,
    replayed: true,
    balance: await balanceFor(tx, customerId, cafeId),
    beansSpent: row.beans_spent,
    reward: rewardSchema.parse(row.reward),
  };
}
