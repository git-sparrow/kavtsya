import type { CafeBalance, Reward } from "@kavtsya/shared";
import type { Database, Queryable } from "./db";
import { isUniqueViolation } from "./db";
import { programFromRow } from "./loyalty";
import { authorizeCounter } from "./shifts";

/**
 * Issuing a Зернятко — the append-only Purchase ledger (#20, ADR 0010). The
 * scan slice's core write: one validated scan appends one `purchases` row; the
 * Customer's balance is derived from the ledger, never mutated.
 *
 * The balance formula — count(purchases) − sum(redemptions.beans_spent) — has
 * exactly one home: here, inside the ledger module (#52). The read functions
 * below are the only balance interface; nothing outside this module spends or
 * counts Зернятка.
 */
function deriveBalance(purchases: number, beansSpent: number): number {
  return purchases - beansSpent;
}

/**
 * How the Customer was identified at the counter (#21, ADR 0006): the scanned
 * rotating QR token, or the typed member code — the offline fallback. The
 * ledger records the source (`purchases.entry_source`), and only the manual
 * path is rate-limited (the QR token is its own proof of freshness).
 */
export type PurchaseEntry =
  | {
      source: "qr";
      /** The validated token's unique id — `unique (qr_jti)` makes earning single-use. */
      jti: string;
    }
  | {
      source: "member_code";
      /** Today's ceiling per (Customer, Café) — Platform-tunable (ADR 0006). */
      dailyLimit: number;
      /** The Kyiv calendar day the ceiling counts within (same convention as the Ворожка pool). */
      kyivDay: string;
    };

export interface IssuePurchaseInput {
  /** The Café the scan happens at. */
  cafeId: string;
  /** Who is physically issuing (`user.id`): the owner or an active grant holder (ADR 0013). */
  issuedByUserId: string;
  /** The Customer the validated QR token or resolved member code identifies. */
  customerId: string;
  /** How the Customer was identified — recorded on the Purchase row. */
  entry: PurchaseEntry;
  /** The scan's instant — the grant-expiry check runs on the injected clock. */
  now: Date;
}

/** Why issuing was refused — named so the wire mapping (#50) can be exhaustive over it. */
export type IssuePurchaseRejection =
  | "cafe_not_owned"
  | "self_scan"
  | "own_cafe"
  | "token_used"
  | "manual_limit_reached";

export type IssuePurchaseOutcome =
  | {
      ok: true;
      customerId: string;
      customerName: string;
      balance: number;
      threshold: number;
      reward: Reward | null;
    }
  | { ok: false; reason: IssuePurchaseRejection };

export async function issuePurchase(
  db: Database,
  { cafeId, issuedByUserId, customerId, entry, now }: IssuePurchaseInput,
): Promise<IssuePurchaseOutcome> {
  // Who may issue here — the ADR 0013 counter-authorization rule, decided once
  // in the Shift module and shared with Redemption confirm (#111). Issuing
  // enforces scanner ≠ scanned; the own-café guard rides along for both paths.
  const auth = await authorizeCounter(db, {
    cafeId,
    actorUserId: issuedByUserId,
    customerId,
    now,
    rejectSelfScan: true,
  });
  if (!auth.ok) return { ok: false, reason: auth.reason };

  // Both arms append the Purchase and ensure the (Customer, Café) membership
  // row — Redemption's FOR UPDATE lock target (#22, ADR 0010) — exists
  // whenever a Purchase does, in one transaction. They differ in their guard:
  //
  // QR: the consumed-token check and the issuance are the same write
  // (ADR 0006) — a duplicate `qr_jti` means the token already earned its
  // Зернятко.
  //
  // Manual: the daily ceiling is derived from the ledger under the membership
  // lock. The membership row is inserted *before* locking (#21): on the
  // Customer's first manual Purchase here there is nothing to lock yet, and a
  // ceiling check with no lock would let two concurrent first entries both
  // pass — the early insert makes one of them wait.
  try {
    const limited = await db.begin(async (tx) => {
      if (entry.source === "member_code") {
        await tx`
          insert into cafe_memberships ("cafe_id", "customer_user_id")
          values (${cafeId}, ${customerId})
          on conflict do nothing
        `;
        await tx`
          select 1 from cafe_memberships
          where "cafe_id" = ${cafeId} and "customer_user_id" = ${customerId}
          for update
        `;
        const [today] = await tx<{ manual_count: number }[]>`
          select count(*)::int as manual_count from purchases
          where "customer_user_id" = ${customerId}
            and "cafe_id" = ${cafeId}
            and "entry_source" = 'member_code'
            and ("created_at" at time zone 'Europe/Kyiv')::date
                  = ${entry.kyivDay}::date
        `;
        if ((today?.manual_count ?? 0) >= entry.dailyLimit) return true;
        await tx`
          insert into purchases
            ("cafe_id", "customer_user_id", "qr_jti", "entry_source",
             "issued_by_user_id")
          values
            (${cafeId}, ${customerId}, null, 'member_code',
             ${issuedByUserId})
        `;
      } else {
        await tx`
          insert into purchases
            ("cafe_id", "customer_user_id", "qr_jti", "entry_source",
             "issued_by_user_id")
          values
            (${cafeId}, ${customerId}, ${entry.jti}, 'qr',
             ${issuedByUserId})
        `;
        await tx`
          insert into cafe_memberships ("cafe_id", "customer_user_id")
          values (${cafeId}, ${customerId})
          on conflict do nothing
        `;
      }
      return false;
    });
    if (limited) return { ok: false, reason: "manual_limit_reached" };
  } catch (err) {
    // Only the QR arm has a unique column to violate (`qr_jti`).
    if (entry.source === "qr" && isUniqueViolation(err)) {
      return { ok: false, reason: "token_used" };
    }
    throw err;
  }

  const program = auth.program;
  const [customer] = await db<{ name: string }[]>`
    select "name" from "user" where "id" = ${customerId}
  `;

  return {
    ok: true,
    customerId,
    customerName: customer?.name ?? "",
    balance: await balanceFor(db, customerId, cafeId),
    threshold: program.threshold,
    reward: program.reward,
  };
}

/** The Customer's derived Зернятко balance at one Café (ADR 0010). */
export async function balanceFor(
  db: Queryable,
  customerId: string,
  cafeId: string,
): Promise<number> {
  const [row] = await db<{ purchases: number; beans_spent: number }[]>`
    select
      (select count(*)::int from purchases
        where "customer_user_id" = ${customerId} and "cafe_id" = ${cafeId})
        as purchases,
      (select coalesce(sum("beans_spent"), 0)::int from redemptions
        where "customer_user_id" = ${customerId} and "cafe_id" = ${cafeId})
        as beans_spent
  `;
  return deriveBalance(row?.purchases ?? 0, row?.beans_spent ?? 0);
}

/**
 * The Cafés where a Customer holds Зернятка, most recently visited first —
 * each Café's balance derived from its own slice of the ledger (ADR 0001:
 * per-Café, never pooled).
 */
export async function listBalances(
  db: Database,
  customerId: string,
): Promise<CafeBalance[]> {
  const rows = await db<
    {
      cafe_id: string;
      cafe_name: string;
      purchases: number;
      beans_spent: number;
      zernyatko_threshold: number;
      reward: unknown;
    }[]
  >`
    select
      c."id" as cafe_id,
      c."name" as cafe_name,
      count(p."id")::int as purchases,
      coalesce(r."beans_spent", 0) as beans_spent,
      c."zernyatko_threshold",
      c."reward"
    from purchases p
    join cafes c on c."id" = p."cafe_id"
    left join (
      select "cafe_id", sum("beans_spent")::int as beans_spent
      from redemptions
      where "customer_user_id" = ${customerId}
      group by "cafe_id"
    ) r on r."cafe_id" = c."id"
    where p."customer_user_id" = ${customerId}
    group by c."id", r."beans_spent"
    order by max(p."created_at") desc
  `;
  return rows.map((row) => {
    const program = programFromRow(row);
    return {
      cafeId: row.cafe_id,
      cafeName: row.cafe_name,
      balance: deriveBalance(row.purchases, row.beans_spent),
      threshold: program.threshold,
      reward: program.reward,
    };
  });
}

/** A membership whose derived balance is below zero — the audited defect (#115). */
export interface NegativeBalance {
  cafeId: string;
  customerId: string;
  balance: number;
}

/**
 * The ledger's core promise audited across every membership (#115, ADR 0010):
 * no (Customer, Café) derived balance may be negative — i.e. no Redemption ever
 * overdrew. It is enforced at write time under the `FOR UPDATE` lock; this reads
 * the whole ledger after the fact so the promise becomes a monitored invariant.
 * An empty result means the invariant holds.
 *
 * Two consumers share this one query: a cross-suite assertion in the test suite,
 * and `scripts/check-ledger-invariant.ts` runnable against a live database before
 * and during pilots. The balance formula stays in its one home — {@link deriveBalance}.
 */
export async function findNegativeBalances(
  db: Database,
): Promise<NegativeBalance[]> {
  const rows = await db<
    {
      cafe_id: string;
      customer_user_id: string;
      purchases: number;
      beans_spent: number;
    }[]
  >`
    select
      m."cafe_id",
      m."customer_user_id",
      coalesce(p."purchases", 0) as purchases,
      coalesce(r."beans_spent", 0) as beans_spent
    from cafe_memberships m
    left join (
      select "cafe_id", "customer_user_id", count(*)::int as purchases
      from purchases group by "cafe_id", "customer_user_id"
    ) p on p."cafe_id" = m."cafe_id"
      and p."customer_user_id" = m."customer_user_id"
    left join (
      select "cafe_id", "customer_user_id", sum("beans_spent")::int as beans_spent
      from redemptions group by "cafe_id", "customer_user_id"
    ) r on r."cafe_id" = m."cafe_id"
      and r."customer_user_id" = m."customer_user_id"
    where coalesce(p."purchases", 0) - coalesce(r."beans_spent", 0) < 0
  `;
  return rows.map((row) => ({
    cafeId: row.cafe_id,
    customerId: row.customer_user_id,
    balance: deriveBalance(row.purchases, row.beans_spent),
  }));
}
