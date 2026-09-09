import type { DeletionPreview, OwnedCafeClosure } from "@kavtsya/shared";
import type { Database } from "./db";
import { countCustomersHoldingBeans, listBalances } from "./purchases";

/**
 * In-app account deletion (#81, ADR 0014) — required by App Store Guideline
 * 5.1.1(v), and the one flow in the app whose whole job is to destroy.
 *
 * Deletion **tombstones**: the `"user"` row is UPDATEd, never DELETEd. PII is
 * scrubbed and every credential revoked, while the account's `purchases` and
 * `redemptions` rows stay exactly where they are — because those rows are not
 * only this Customer's history. They are every Café's history, and the
 * denominator of every *other* Customer's balance. Removing one person's row
 * would silently rewrite other people's Зернятка, which ADR 0010's append-only
 * ledger forbids and ADR 0014 settled: leaving is a right, and it never costs
 * anyone else a bean.
 *
 * Better Auth's own `user.deleteUser` is deliberately NOT enabled (docs checked
 * 2026-07-27, v1.6.19): it hard-deletes the row, and its hooks can only block
 * (`beforeDelete`) or clean up after the fact (`afterDelete`) — neither can turn
 * the destructive step into an update. So this module is the first-party
 * endpoint #81 named as the fallback, and it owns the auth-table cleanup itself.
 *
 * Deletion is permanent and immediate — no grace period, nothing to restore, by
 * anyone (rejected 2026-07-10). {@link deletionPreview} is the mitigation that
 * decision bought: the confirm screen earns the permanence by naming, before the
 * tap, every balance and every Café that dies.
 */

/**
 * What the account loses, read before it is asked to confirm (#81 user story 2).
 * A pure read — it changes nothing, and it is safe to call for an account that
 * will then decide to stay.
 *
 * `balances` comes from the very query the Customer's own list renders, so the
 * screen can never quote a Зернятко count the app contradicts one tap earlier.
 */
export async function deletionPreview(
  db: Database,
  userId: string,
): Promise<DeletionPreview> {
  const owned = await db<{ id: string; name: string }[]>`
    select "id", "name" from cafes
    where "owner_user_id" = ${userId} and "archived_at" is null
    order by "created_at" asc
  `;
  const cafes: OwnedCafeClosure[] = await Promise.all(
    owned.map(async (cafe) => ({
      cafeId: cafe.id,
      cafeName: cafe.name,
      affectedCustomers: await countCustomersHoldingBeans(db, cafe.id),
    })),
  );
  return { balances: await listBalances(db, userId), cafes };
}

/**
 * Tombstone the account and archive every Café it owns — one transaction, so an
 * account is never half-deleted (identities gone but the Café still scanning).
 *
 * Idempotent: the tombstone `update` is guarded on `deleted_at is null`, and a
 * second attempt from a stale session finds no row to claim and stops there —
 * so a retry can neither re-scrub nor re-archive nor corrupt anything.
 *
 * What is scrubbed vs kept is the whole policy in one place:
 * - **Scrubbed** — name, avatar, email (replaced with a value derived from the
 *   user id, which is unique, so the real address is freed for a fresh signup),
 *   member code, push consent.
 * - **Deleted** — Better Auth `account` (login identities) and `session` rows,
 *   push tokens and the delivery tickets that reference them, and Ворожка
 *   history; every scanner grant is revoked. The credentials and the authority
 *   to act must not outlive the account; the fortunes are personal content the
 *   confirm screen promises is gone («історія Ворожки — назавжди»). A
 *   `push_tickets` row is operational telemetry — a handle for the receipts
 *   script to poll Expo with — not ledger history: nobody else's balance
 *   derives from it, so unlike a Purchase it has no claim to outlive the
 *   account that received it (#253).
 * - **Kept** — `purchases` and `redemptions` (other people's balances depend on
 *   them), the account's roster rows at other people's Cafés, and its authorship
 *   of Cafés' records: the Зернятка it issued and the campaigns it sent stay
 *   attributed to the tombstoned row, an anonymous placeholder wherever history
 *   is displayed (#81 user story 12).
 *
 * Archival's reach is deliberately narrow. Only the two paths a *live* actor can
 * still take at a closed Café filter on `archived_at`: the counter
 * (`authorizeCounter` — issuance and Redemption, which a barista could still
 * attempt) and the poster scan (`scanPoster` — the wall sticker outlives the
 * Café). The owner-only reads — program config, analytics, campaigns — need no
 * such filter, because the only account that can reach them is the one this
 * function just tombstoned.
 */
export async function deleteAccount(
  db: Database,
  userId: string,
  now: Date,
): Promise<void> {
  await db.begin(async (tx) => {
    // Claim the deletion first: `deleted_at is null` makes this the idempotency
    // gate for everything below it, and the row lock it takes serializes a
    // double-tap into one winner.
    const claimed = await tx`
      update "user"
      set "deleted_at" = ${now},
          "name" = 'Видалений акаунт',
          "email" = ${tombstoneEmail(userId)},
          -- The social avatar Google/Apple sign-in copies onto the row is a
          -- photograph of a person; it goes with the name and the address.
          "image" = null,
          "member_code" = null,
          "push_consent" = false
      where "id" = ${userId} and "deleted_at" is null
    `;
    if (claimed.count === 0) return;

    // The Café closes rather than disappears (ADR 0014): its ledger stays whole
    // and its Customers keep — frozen — what they earned. `archived_at is null`
    // keeps an already-closed Café's closing instant honest.
    const archived = await tx<{ id: string }[]>`
      update cafes set "archived_at" = ${now}
      where "owner_user_id" = ${userId} and "archived_at" is null
      returning "id"
    `;

    // Shifts end — at the closed Cafés, and wherever this account was working
    // («Зміни завершаться», screen 7d). Revoking rather than deleting keeps the
    // shift board's history intact.
    await tx`
      update cafe_scanner_grants set "revoked_at" = ${now}
      where "revoked_at" is null and "user_id" = ${userId}
    `;
    const closedCafeIds = archived.map((c) => c.id);
    if (closedCafeIds.length > 0) {
      await tx`
        update cafe_scanner_grants set "revoked_at" = ${now}
        where "revoked_at" is null and "cafe_id" in ${tx(closedCafeIds)}
      `;
    }

    // The roster row at someone ELSE's Café deliberately stays: it is that
    // CafeOwner's record, and deleting it would be this account's departure
    // editing another person's data. The tombstoned name renders as the
    // anonymous placeholder wherever history shows it (#81 user story 12), and
    // the revocation above already means the row can never be worked again.
    // Tickets first: `push_tickets.push_token_id` references `push_tokens` with
    // no cascade (ADR 0014's posture, migration 0011), and nothing else ever
    // deletes a ticket — `push-receipts.ts` only stamps `resolved_at`. So a
    // single campaign push used to pin the token row and fail the whole
    // deletion, permanently (#253). Deleted explicitly here rather than by an
    // `on delete cascade` on the constraint: the policy for what survives an
    // account belongs in this module, where it is stated and reviewable, not
    // hidden in a schema rule that would re-open exactly the implicit-
    // destruction pattern migration 0017 closed.
    //
    // The campaign's own `recipient_count` is a stored integer, so a Café's
    // ledger row still reports who it reached — one Customer leaving never
    // rewrites another party's record.
    await tx`
      delete from push_tickets
      where "push_token_id" in (
        select "id" from push_tokens where "user_id" = ${userId}
      )
    `;
    await tx`delete from push_tokens where "user_id" = ${userId}`;
    await tx`delete from customer_fortunes where "customer_user_id" = ${userId}`;
    // Login identities and live sessions: after this the account cannot
    // authenticate, and a replayed cookie resolves to nothing.
    await tx`delete from "account" where "userId" = ${userId}`;
    await tx`delete from "session" where "userId" = ${userId}`;
  });
}

/**
 * The address a tombstoned account carries. Derived from the user id, so it is
 * unique without a lookup (the column is unique) and collides with no real
 * inbox — which is the point: the Customer's actual address is released, and
 * they can sign up again with it (#81 user story 4). The fresh account is a
 * genuinely new one; nothing links it back to the old history.
 */
function tombstoneEmail(userId: string): string {
  return `deleted+${userId}@kavtsya.invalid`;
}

/** Whether an account has been tombstoned — the "this session cannot act" read. */
export async function isTombstoned(
  db: Database,
  userId: string,
): Promise<boolean> {
  const [row] = await db<{ deleted_at: Date | null }[]>`
    select "deleted_at" from "user" where "id" = ${userId}
  `;
  return row?.deleted_at != null;
}
