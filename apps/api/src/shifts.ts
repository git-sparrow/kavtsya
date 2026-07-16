import type { Database, Queryable } from "./db";

/**
 * «Зміна» — the shift lifecycle (#98/#99, ADR 0013). A Shift is a café-scoped,
 * time-boxed, revocable scanner capability on the barista's own Customer
 * account. It is started by a rostered barista (or the owner) scanning the
 * Café's non-secret wall poster — the entry point lives in `roster.ts`, which
 * authorizes the scan and calls `startShift` here. The grant is the capability:
 * active while now < expires_at and not revoked.
 *
 * Three things end a shift (#99): the barista («Завершити зміну» → `endMyShift`),
 * the owner (board end → `revokeShiftGrant`, or removal from the roster →
 * `roster.ts`), and a rolling ~16h auto-expire backstop (`expires_at`). The scan
 * path re-checks `hasActiveScannerGrant` on every request, so revocation needs
 * no client polling.
 */

/**
 * The rolling auto-expire cap (#99): a café-hours-agnostic safety net, not a
 * scheduler. A shift nobody ends dies ~16h after it started — long enough to
 * cover the longest single day behind a counter, short enough that a forgotten
 * shift never lingers indefinitely. A module constant like the roster cooldown;
 * v1 has no reason to vary it per café.
 */
export const SHIFT_MAX_DURATION_MS = 16 * 60 * 60 * 1000;

/**
 * Start (or reuse) a shift for `userId` at `cafeId`, enforcing one active shift
 * per account (#99) in a single transaction:
 *  - `authorize` is re-checked INSIDE the transaction, so a concurrent removal
 *    (which revokes grants and deletes the roster row in its own transaction)
 *    can never race between an out-of-transaction check and this insert and
 *    leave a removed barista holding a live grant — the server-side
 *    authorization floor. Null when the account is no longer authorized (the
 *    caller then treats the scan as a fresh request).
 *  - an active shift already at THIS Café is reused (idempotent re-scan);
 *  - any active shift at ANOTHER Café is ended first — the switch the caller
 *    has already confirmed with the barista.
 * Returns when the (new or reused) grant expires — its rolling ~16h cap.
 */
export async function startShift(
  db: Database,
  cafeId: string,
  userId: string,
  now: Date,
  authorize: (tx: Queryable) => Promise<boolean>,
): Promise<Date | null> {
  return db.begin(async (tx): Promise<Date | null> => {
    if (!(await authorize(tx))) return null;

    // Reuse an active grant at this Café: a double-scan of the same poster is a
    // no-op, not a second grant.
    const [existing] = await tx<{ expires_at: Date }[]>`
      select "expires_at" from cafe_scanner_grants
      where "cafe_id" = ${cafeId} and "user_id" = ${userId}
        and "revoked_at" is null and "expires_at" > ${now}
      order by "created_at" desc
      limit 1
    `;
    if (existing) return existing.expires_at;

    // The one-active-shift rule: end any active shift elsewhere. The caller only
    // reaches here for the same Café or a confirmed switch, so this revokes the
    // shift the barista is switching away from.
    await tx`
      update cafe_scanner_grants set "revoked_at" = ${now}
      where "user_id" = ${userId}
        and "revoked_at" is null and "expires_at" > ${now}
    `;

    const expiresAt = new Date(now.getTime() + SHIFT_MAX_DURATION_MS);
    await tx`
      insert into cafe_scanner_grants
        ("cafe_id", "user_id", "expires_at", "created_by")
      values (${cafeId}, ${userId}, ${expiresAt}, ${userId})
    `;
    return expiresAt;
  });
}

/**
 * Whether `userId` holds an active scanner grant at `cafeId` — the ADR 0013
 * capability check the two counter paths (issue + confirm) widen on. Active =
 * not revoked and not yet expired; expiry compares against the injected clock's
 * instant, so the self-healing time-box is testable. Removal revokes the grant
 * (`roster.ts`), so a removed barista fails this check on their very next scan.
 */
export async function hasActiveScannerGrant(
  db: Database,
  cafeId: string,
  userId: string,
  now: Date,
): Promise<boolean> {
  const [row] = await db<{ found: number }[]>`
    select 1 as found from cafe_scanner_grants
    where "cafe_id" = ${cafeId} and "user_id" = ${userId}
      and "revoked_at" is null and "expires_at" > ${now}
    limit 1
  `;
  return row !== undefined;
}

/**
 * The owner's shift board: active grants at their Café, most recent first.
 * Null when the Café isn't theirs (or doesn't exist — indistinguishable).
 */
export async function listActiveShifts(
  db: Database,
  cafeId: string,
  ownerUserId: string,
  now: Date,
): Promise<{ id: string; baristaName: string; expiresAt: Date }[] | null> {
  const [cafe] = await db<{ id: string }[]>`
    select "id" from cafes
    where "id" = ${cafeId} and "owner_user_id" = ${ownerUserId}
  `;
  if (!cafe) return null;

  const rows = await db<
    { id: string; barista_name: string; expires_at: Date }[]
  >`
    select g."id", u."name" as barista_name, g."expires_at"
    from cafe_scanner_grants g join "user" u on u."id" = g."user_id"
    where g."cafe_id" = ${cafeId}
      and g."revoked_at" is null and g."expires_at" > ${now}
    order by g."created_at" desc
  `;
  return rows.map((row) => ({
    id: row.id,
    baristaName: row.barista_name,
    expiresAt: row.expires_at,
  }));
}

/**
 * Revoke one shift now (owner board-end): the un-revoked grant at the owner's
 * own Café. False when there is nothing the caller may revoke — a foreign
 * café's grant, a foreign caller, or a grant already gone (all
 * indistinguishable, like every ownership miss).
 */
export async function revokeShiftGrant(
  db: Database,
  cafeId: string,
  grantId: string,
  ownerUserId: string,
  now: Date,
): Promise<boolean> {
  const rows = await db<{ id: string }[]>`
    update cafe_scanner_grants g set "revoked_at" = ${now}
    from cafes c
    where g."id" = ${grantId} and g."cafe_id" = ${cafeId}
      and c."id" = g."cafe_id" and c."owner_user_id" = ${ownerUserId}
      and g."revoked_at" is null
    returning g."id"
  `;
  return rows.length > 0;
}

/**
 * The active shift this account holds, or null — what the barista's app reads to
 * know it is (still) in Scanner Mode. Latest start wins if several are somehow
 * live at once.
 */
export async function activeShiftFor(
  db: Database,
  userId: string,
  now: Date,
): Promise<{ cafeId: string; cafeName: string; expiresAt: Date } | null> {
  const [row] = await db<
    { cafe_id: string; cafe_name: string; expires_at: Date }[]
  >`
    select g."cafe_id", c."name" as cafe_name, g."expires_at"
    from cafe_scanner_grants g join cafes c on c."id" = g."cafe_id"
    where g."user_id" = ${userId}
      and g."revoked_at" is null and g."expires_at" > ${now}
    order by g."created_at" desc
    limit 1
  `;
  if (!row) return null;
  return {
    cafeId: row.cafe_id,
    cafeName: row.cafe_name,
    expiresAt: row.expires_at,
  };
}

/**
 * End the caller's OWN shift (#96, ADR 0015): revoke every active scanner grant
 * this account holds, so «Завершити зміну» drops the barista out of the
 * near-kiosk Scanner Mode at once — under the derived-landing Modes an active
 * grant pins the app to Scanner, so leaving the screen is not enough; the grant
 * itself must end. Self-authorized (you may always end your own shift, no
 * ownership) and idempotent: with none active it revokes nothing. Returns how
 * many grants it ended.
 */
export async function endMyShift(
  db: Database,
  userId: string,
  now: Date,
): Promise<number> {
  const rows = await db<{ id: string }[]>`
    update cafe_scanner_grants set "revoked_at" = ${now}
    where "user_id" = ${userId}
      and "revoked_at" is null and "expires_at" > ${now}
    returning "id"
  `;
  return rows.length;
}
