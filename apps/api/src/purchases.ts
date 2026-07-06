import type { CafeBalance, Reward } from "@kavtsya/shared";
import { deriveBalance } from "./balance";
import type { Database } from "./db";
import { programFromRow } from "./loyalty";

/**
 * Issuing a Зернятко — the append-only Purchase ledger (#20, ADR 0010). The
 * scan slice's core write: one validated scan appends one `purchases` row; the
 * Customer's balance is derived from the ledger, never mutated.
 */

export interface IssuePurchaseInput {
  /** The Café the CafeOwner is issuing at. */
  cafeId: string;
  /** The acting CafeOwner (`user.id`) — must own the Café. */
  ownerUserId: string;
  /** The Customer the validated QR token authenticates. */
  customerId: string;
  /** The validated token's unique id — `unique (qr_jti)` makes earning single-use. */
  jti: string;
}

/** Why issuing was refused — named so the wire mapping (#50) can be exhaustive over it. */
export type IssuePurchaseRejection =
  | "cafe_not_owned"
  | "own_cafe"
  | "token_used";

export type IssuePurchaseOutcome =
  | {
      ok: true;
      customerName: string;
      balance: number;
      threshold: number;
      reward: Reward | null;
    }
  | { ok: false; reason: IssuePurchaseRejection };

/** postgres.js surfaces Postgres errors with the SQLSTATE in `code`. */
const UNIQUE_VIOLATION = "23505";

export async function issuePurchase(
  db: Database,
  { cafeId, ownerUserId, customerId, jti }: IssuePurchaseInput,
): Promise<IssuePurchaseOutcome> {
  // Ownership check and program read are one query (same pattern as loyalty):
  // a Café that doesn't exist and one the caller doesn't own are indistinguishable.
  const [cafe] = await db<
    { owner_user_id: string; zernyatko_threshold: number; reward: unknown }[]
  >`
    select "owner_user_id", "zernyatko_threshold", "reward"
    from cafes
    where "id" = ${cafeId} and "owner_user_id" = ${ownerUserId}
  `;
  if (!cafe) return { ok: false, reason: "cafe_not_owned" };

  // Self-farming guard (ADR 0003): a CafeOwner cannot earn at a Café they own.
  if (customerId === cafe.owner_user_id) {
    return { ok: false, reason: "own_cafe" };
  }

  // The consumed-token check and the issuance are the same write (ADR 0006):
  // a duplicate `qr_jti` means this token already earned its Зернятко.
  try {
    await db`
      insert into purchases ("cafe_id", "customer_user_id", "qr_jti")
      values (${cafeId}, ${customerId}, ${jti})
    `;
  } catch (err) {
    if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
      return { ok: false, reason: "token_used" };
    }
    throw err;
  }

  const program = programFromRow(cafe);
  const [customer] = await db<{ name: string }[]>`
    select "name" from "user" where "id" = ${customerId}
  `;

  return {
    ok: true,
    customerName: customer?.name ?? "",
    balance: await balanceFor(db, customerId, cafeId),
    threshold: program.threshold,
    reward: program.reward,
  };
}

/** The Customer's derived Зернятко balance at one Café (ADR 0010). */
export async function balanceFor(
  db: Database,
  customerId: string,
  cafeId: string,
): Promise<number> {
  const [row] = await db<{ purchases: number }[]>`
    select count(*)::int as purchases
    from purchases
    where "customer_user_id" = ${customerId} and "cafe_id" = ${cafeId}
  `;
  // Redemptions land in #22; until then nothing has been spent.
  return deriveBalance({ purchases: row?.purchases ?? 0, beansSpent: 0 });
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
      zernyatko_threshold: number;
      reward: unknown;
    }[]
  >`
    select
      c."id" as cafe_id,
      c."name" as cafe_name,
      count(p."id")::int as purchases,
      c."zernyatko_threshold",
      c."reward"
    from purchases p
    join cafes c on c."id" = p."cafe_id"
    where p."customer_user_id" = ${customerId}
    group by c."id"
    order by max(p."created_at") desc
  `;
  return rows.map((row) => {
    const program = programFromRow(row);
    return {
      cafeId: row.cafe_id,
      cafeName: row.cafe_name,
      balance: deriveBalance({ purchases: row.purchases, beansSpent: 0 }),
      threshold: program.threshold,
      reward: program.reward,
    };
  });
}
