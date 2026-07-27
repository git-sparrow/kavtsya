import type { LoyaltyProgram } from "@kavtsya/shared";
import { kyivDayOf } from "./clock";
import type { Database, Queryable } from "./db";
import { programFromRow } from "./loyalty";

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
 * The active-grant predicate (ADR 0013): a grant is live while it is not revoked
 * and not yet expired against the injected clock. The Shift module owns the
 * `cafe_scanner_grants` table, so this two-column test is written exactly once —
 * every "is this grant active" query below (and the roster's instant-termination
 * via `endActiveGrants`) composes this fragment instead of re-typing the columns,
 * so the predicate and the table shape never leak outside this module (#111).
 *
 * `alias` qualifies the columns when the statement joins the grant table under an
 * alias (e.g. `g`); omit it for single-table statements. The fragment is built
 * with the caller's own executor, so it composes into a `db` query or a `tx`
 * query interchangeably.
 */
function activeGrant(sql: Queryable, now: Date, alias?: string) {
  const col = (name: string) =>
    alias ? sql`${sql(alias)}.${sql(name)}` : sql`${sql(name)}`;
  return sql`${col("revoked_at")} is null and ${col("expires_at")} > ${now}`;
}

/**
 * Who may operate a Café's counter (ADR 0013), decided in exactly one place so
 * the two ledger writes — issuing a Зернятко and confirming a Redemption — can't
 * drift apart (#111). The counter is open to the Café's owner OR an account
 * holding an active scanner grant there; a Café that doesn't exist and one the
 * caller may not operate stay indistinguishable (the same "not found" the
 * owner-only check always gave). On success it carries the Café's loyalty program
 * through, so a caller that cleared the gate provably has one to work with.
 */
export type CounterRejection = "cafe_not_owned" | "self_scan" | "own_cafe";

export type AuthorizeCounterOutcome<R extends CounterRejection> =
  | { ok: true; program: LoyaltyProgram }
  | { ok: false; reason: R };

export interface AuthorizeCounterInput {
  /** The Café the scan happens at. */
  cafeId: string;
  /** Who is operating the counter (`user.id`): the owner or an active grant holder. */
  actorUserId: string;
  /** The Customer the validated QR token or resolved member code identifies. */
  customerId: string;
  /** The scan's instant — the grant-expiry check runs on the injected clock. */
  now: Date;
  /**
   * Whether to enforce scanner ≠ scanned (`self_scan`) — the one guard the two
   * counter paths deliberately differ on (ADR 0013, clarified 2026-07-10).
   * Issuing sets it (nobody mints a Зернятко to their own code); confirming
   * leaves it off (a confirm to one's own code is already caught by `own_cafe`).
   * Making it a required argument marks that divergence at every call site.
   */
  rejectSelfScan: boolean;
}

export function authorizeCounter(
  db: Database,
  input: AuthorizeCounterInput & { rejectSelfScan: true },
): Promise<
  AuthorizeCounterOutcome<"cafe_not_owned" | "self_scan" | "own_cafe">
>;
export function authorizeCounter(
  db: Database,
  input: AuthorizeCounterInput & { rejectSelfScan: false },
): Promise<AuthorizeCounterOutcome<"cafe_not_owned" | "own_cafe">>;
export async function authorizeCounter(
  db: Database,
  {
    cafeId,
    actorUserId,
    customerId,
    now,
    rejectSelfScan,
  }: AuthorizeCounterInput,
): Promise<AuthorizeCounterOutcome<CounterRejection>> {
  const [cafe] = await db<
    { owner_user_id: string; zernyatko_threshold: number; reward: unknown }[]
  >`
    select "owner_user_id", "zernyatko_threshold", "reward"
    from cafes
    where "id" = ${cafeId} and "archived_at" is null
  `;
  // A Café that doesn't exist, one the caller may not operate, and one that has
  // closed (#81, ADR 0014) all answer the same "not found": an archived Café
  // issues and redeems nothing, and the predicate lives in the lookup so no
  // counter path can forget it — this one query gates both ledger writes.
  if (!cafe) return { ok: false, reason: "cafe_not_owned" };
  if (
    cafe.owner_user_id !== actorUserId &&
    !(await hasActiveScannerGrant(db, cafeId, actorUserId, now))
  ) {
    return { ok: false, reason: "cafe_not_owned" };
  }

  // The self-farm guards are additive (ADR 0013, clarified 2026-07-10).
  // Scanner ≠ scanned: only issuing forbids minting to one's own code…
  if (rejectSelfScan && customerId === actorUserId) {
    return { ok: false, reason: "self_scan" };
  }
  // …and the owner still earns nothing at their own Café, whoever scans them
  // (ADR 0003) — enforced on both paths, additive to the self_scan guard.
  if (customerId === cafe.owner_user_id) {
    return { ok: false, reason: "own_cafe" };
  }

  return { ok: true, program: programFromRow(cafe) };
}

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
        and ${activeGrant(tx, now)}
      order by "created_at" desc
      limit 1
    `;
    if (existing) return existing.expires_at;

    // The one-active-shift rule: end any active shift elsewhere. The caller only
    // reaches here for the same Café or a confirmed switch, so this revokes the
    // shift the barista is switching away from.
    await tx`
      update cafe_scanner_grants set "revoked_at" = ${now}
      where "user_id" = ${userId} and ${activeGrant(tx, now)}
    `;

    const expiresAt = new Date(now.getTime() + SHIFT_MAX_DURATION_MS);
    // `created_at` is set from the injected clock, not the DB default, so a
    // shift's start and its expiry come from ONE clock — `started_at + 16h ===
    // expires_at` always holds, and the board's «з HH:MM» is deterministic under
    // a pinned test clock (the shift window that attributes scans depends on it).
    await tx`
      insert into cafe_scanner_grants
        ("cafe_id", "user_id", "expires_at", "created_by", "created_at")
      values (${cafeId}, ${userId}, ${expiresAt}, ${userId}, ${now})
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
      and ${activeGrant(db, now)}
    limit 1
  `;
  return row !== undefined;
}

/**
 * End every active scanner grant `userId` holds at `cafeId`, revoking them
 * against the injected clock — the Shift module's instant-termination primitive
 * (#99, #111). It takes the caller's executor (`db` or a `tx`), so the roster's
 * `removeBarista` runs the roster-row delete and this revoke in ONE transaction,
 * keeping instant termination atomic without the grant predicate or table shape
 * leaking into that module. Returns how many grants it ended (0 when none were
 * live) — idempotent by construction.
 */
export async function endActiveGrants(
  sql: Queryable,
  cafeId: string,
  userId: string,
  now: Date,
): Promise<number> {
  const rows = await sql<{ id: string }[]>`
    update cafe_scanner_grants set "revoked_at" = ${now}
    where "cafe_id" = ${cafeId} and "user_id" = ${userId}
      and ${activeGrant(sql, now)}
    returning "id"
  `;
  return rows.length;
}

/**
 * A shift's «сканів» tally (5c): the Зернятка this account issued at this Café
 * within the grant's window, attributed via `purchases.issued_by_user_id` (the
 * #62 audit column set on every issuance path). The window runs from the grant's
 * start up to its end — `revoked_at` for an ended shift, else `expires_at`, which
 * for a still-active grant sits in the future so the count naturally includes
 * every scan up to now. Written once here and shared by both board lists so the
 * active and completed tallies can't drift.
 */
function shiftScanCount(sql: Queryable) {
  // Both board queries alias the grant table `g`; the fragment reads its columns.
  const g = (name: string) => sql`${sql("g")}.${sql(name)}`;
  return sql`(
    select count(*) from purchases p
    where p."cafe_id" = ${g("cafe_id")}
      and p."issued_by_user_id" = ${g("user_id")}
      and p."created_at" >= ${g("created_at")}
      and p."created_at" <= coalesce(${g("revoked_at")}, ${g("expires_at")})
  )`;
}

/** One active shift as the board reads it — start, expiry, and its scan tally. */
export interface ActiveShift {
  id: string;
  baristaName: string;
  startedAt: Date;
  expiresAt: Date;
  scanCount: number;
}

/** One shift that closed today (owner-ended, self-ended, or auto-expired). */
export interface CompletedShift {
  baristaName: string;
  startedAt: Date;
  endedAt: Date;
  scanCount: number;
}

/**
 * The owner's shift board (5c): who is on shift now (most recent first), and
 * which shifts already closed **today** (Europe/Kyiv business day, like
 * analytics — an evening never rolls the day over mid-shift). Null when the Café
 * isn't theirs (or doesn't exist — indistinguishable, like every ownership miss).
 *
 * A completed shift is one no longer active — revoked (owner/self/removal) or
 * past its rolling cap — whose end instant falls on today's Kyiv day; `ended_at`
 * is the revoke instant if any, else the expiry. Both lists share one scan-count
 * expression so the tally means the same thing on either side.
 */
export async function listShiftBoard(
  db: Database,
  cafeId: string,
  ownerUserId: string,
  now: Date,
): Promise<{ active: ActiveShift[]; completedToday: CompletedShift[] } | null> {
  const [cafe] = await db<{ id: string }[]>`
    select "id" from cafes
    where "id" = ${cafeId} and "owner_user_id" = ${ownerUserId}
  `;
  if (!cafe) return null;

  const activeRows = await db<
    {
      id: string;
      barista_name: string;
      started_at: Date;
      expires_at: Date;
      scan_count: string;
    }[]
  >`
    select
      g."id",
      u."name" as barista_name,
      g."created_at" as started_at,
      g."expires_at",
      ${shiftScanCount(db)} as scan_count
    from cafe_scanner_grants g join "user" u on u."id" = g."user_id"
    where g."cafe_id" = ${cafeId} and ${activeGrant(db, now, "g")}
    order by g."created_at" desc
  `;

  const completedRows = await db<
    {
      barista_name: string;
      started_at: Date;
      ended_at: Date;
      scan_count: string;
    }[]
  >`
    select
      u."name" as barista_name,
      g."created_at" as started_at,
      coalesce(g."revoked_at", g."expires_at") as ended_at,
      ${shiftScanCount(db)} as scan_count
    from cafe_scanner_grants g join "user" u on u."id" = g."user_id"
    where g."cafe_id" = ${cafeId}
      and not (${activeGrant(db, now, "g")})
      and (coalesce(g."revoked_at", g."expires_at") at time zone 'Europe/Kyiv')::date
          = ${kyivDayOf(now)}::date
    order by ended_at desc
  `;

  return {
    active: activeRows.map((row) => ({
      id: row.id,
      baristaName: row.barista_name,
      startedAt: row.started_at,
      expiresAt: row.expires_at,
      scanCount: Number(row.scan_count),
    })),
    completedToday: completedRows.map((row) => ({
      baristaName: row.barista_name,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      scanCount: Number(row.scan_count),
    })),
  };
}

/**
 * Which of a Café's accounts hold an active scanner grant right now — the source
 * of the Roster board's «● на зміні» dot (5b). Lives here, not in `roster.ts`, so
 * the grant predicate and the `cafe_scanner_grants` table stay behind the Shift
 * module's seam (#111): the roster decorates its rows through this set instead of
 * querying the grant table itself.
 */
export async function activeShiftUserIds(
  db: Database,
  cafeId: string,
  now: Date,
): Promise<Set<string>> {
  const rows = await db<{ user_id: string }[]>`
    select distinct "user_id" from cafe_scanner_grants
    where "cafe_id" = ${cafeId} and ${activeGrant(db, now)}
  `;
  return new Set(rows.map((row) => row.user_id));
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
    where g."user_id" = ${userId} and ${activeGrant(db, now, "g")}
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
    where "user_id" = ${userId} and ${activeGrant(db, now)}
    returning "id"
  `;
  return rows.length;
}
