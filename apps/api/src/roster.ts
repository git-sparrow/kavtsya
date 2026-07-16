import { normalizeMemberCode } from "@kavtsya/shared";
import type { Clock } from "./clock";
import type { Database, Queryable } from "./db";
import { isUniqueViolation } from "./db";
import { activeShiftFor, startShift } from "./shifts";

/**
 * The Barista Roster (#97) + poster-started Shifts (#98/#99, ADR 0013). A Café's
 * persistent, café-scoped trusted-barista list plus the non-secret wall poster
 * that both starts a Shift (for a rostered account) and raises a request (for a
 * stranger). States are just rostered / pending / none (no denylist) — a
 * `cafe_barista_roster` row is `pending` (a raised request) or `rostered`
 * (approved), and no row is none.
 *
 * Security rests on the roster, not the poster: scanning the code only ever
 * IDENTIFIES the Café. A rostered scan starts a Shift; a non-rostered scan
 * grants nothing — it raises a deduped, rate-limited pending request the owner
 * must approve.
 */

/**
 * How long a raised request silences repeat scans of the same account before a
 * fresh owner ping is allowed again — the rate-limit against repeat/decline
 * spam. Tunable; a module constant like the shift auto-expire backstop, not
 * Platform config (v1 has no reason to vary it per café).
 */
export const ROSTER_REQUEST_COOLDOWN_MS = 10 * 60_000;

/**
 * Why the poster scan resolved as it did — the route maps it to the wire (#50).
 * A rostered account (or the owner) starts a Shift, unless one already runs at
 * another Café: then `switch_required` reports both and awaits an explicit
 * confirm (#99). A non-rostered account raises (or refreshes) a pending request.
 */
export type ScanPosterOutcome =
  | { status: "unknown_poster" }
  | {
      status: "shift_started";
      cafeId: string;
      cafeName: string;
      expiresAt: Date;
    }
  | {
      status: "switch_required";
      cafeId: string;
      cafeName: string;
      /** The Café the barista is on shift at now — the one the switch would end. */
      currentCafeName: string;
    }
  | {
      status: "pending";
      cafeName: string;
      /** The owner to notify — the operational push target (#97, not consent-gated). */
      ownerUserId: string;
      /** Whether THIS scan should push: false when deduped inside the cooldown. */
      notify: boolean;
    };

export interface ScanPosterInput {
  /** The scanned (or typed) poster code — normalized before lookup, like the member code (#21). */
  posterCode: string;
  /** The barista's own account the Shift (or request) attaches to. */
  userId: string;
  /**
   * Second step of the one-active-shift switch (#99): true ends an active shift
   * elsewhere and starts this one. Absent, a conflicting shift returns
   * `switch_required` instead of silently stealing the barista off their post.
   */
  confirmSwitch?: boolean | undefined;
}

/**
 * The poster scan (#98/#99). A rostered account (or the owner, rostered by
 * construction) starts a Shift and lands in Scanner Mode; a stranger raises a
 * pending request. The one-active-shift rule (#99) makes a scan meeting an
 * active shift at another Café return `switch_required` until confirmed.
 */
export async function scanPoster(
  db: Database,
  clock: Clock,
  { posterCode, userId, confirmSwitch }: ScanPosterInput,
): Promise<ScanPosterOutcome> {
  const [cafe] = await db<
    { id: string; name: string; owner_user_id: string }[]
  >`
    select "id", "name", "owner_user_id" from cafes
    where "poster_code" = ${normalizeMemberCode(posterCode)}
  `;
  if (!cafe) return { status: "unknown_poster" };

  // Authorized to scan = the owner (privileged at their own Café by
  // construction) or a rostered barista. This out-of-transaction read only
  // ROUTES the scan (shift path vs pending request) and gates the switch
  // prompt; the authoritative check runs inside `startShift`'s transaction.
  const isOwner = cafe.owner_user_id === userId;
  const authorized = isOwner || (await isRostered(db, cafe.id, userId));

  if (authorized) {
    const now = clock.now();
    // One active shift per account (#99): a shift already running at ANOTHER
    // Café must be switched explicitly. A shift at THIS Café is fine —
    // `startShift` reuses it (idempotent re-scan).
    const current = await activeShiftFor(db, userId, now);
    if (current && current.cafeId !== cafe.id && !confirmSwitch) {
      return {
        status: "switch_required",
        cafeId: cafe.id,
        cafeName: cafe.name,
        currentCafeName: current.cafeName,
      };
    }
    // Re-verify authorization inside the grant transaction so a removal racing
    // this scan can't leave a removed barista with a live grant.
    const expiresAt = await startShift(db, cafe.id, userId, now, (tx) =>
      isOwner ? Promise.resolve(true) : isRostered(tx, cafe.id, userId),
    );
    // Removed mid-scan (lost the race): no longer trust — fall through to a
    // fresh request, exactly as a re-scan after removal would (no denylist).
    if (expiresAt !== null) {
      return {
        status: "shift_started",
        cafeId: cafe.id,
        cafeName: cafe.name,
        expiresAt,
      };
    }
  }

  return raisePendingRequest(db, clock, cafe, userId);
}

/** Whether this account is on the Café's roster as an approved barista. */
async function isRostered(
  db: Queryable,
  cafeId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db<{ found: number }[]>`
    select 1 as found from cafe_barista_roster
    where "cafe_id" = ${cafeId} and "user_id" = ${userId}
      and "status" = 'rostered'
    limit 1
  `;
  return row !== undefined;
}

/**
 * A non-rostered scan: raise (or refresh) a deduped, rate-limited pending
 * request. First scan inserts and asks to ping the owner; a repeat inside the
 * cooldown is silenced; a repeat after it elapses refreshes the clock and pings
 * again (the owner may have missed the first). A pending row this account
 * already holds is refreshed, never re-inserted (unique (cafe_id, user_id)).
 */
async function raisePendingRequest(
  db: Database,
  clock: Clock,
  cafe: { id: string; name: string; owner_user_id: string },
  userId: string,
): Promise<ScanPosterOutcome> {
  const now = clock.now();
  const pending = {
    status: "pending" as const,
    cafeName: cafe.name,
    ownerUserId: cafe.owner_user_id,
  };

  const [existing] = await db<{ requested_at: Date }[]>`
    select "requested_at" from cafe_barista_roster
    where "cafe_id" = ${cafe.id} and "user_id" = ${userId}
  `;

  if (existing) {
    // A pending request already stands. Silence repeat scans inside the
    // cooldown; once it elapses, refresh the timestamp and let the owner be
    // pinged again.
    const elapsed = now.getTime() - existing.requested_at.getTime();
    if (elapsed < ROSTER_REQUEST_COOLDOWN_MS) {
      return { ...pending, notify: false };
    }
    await db`
      update cafe_barista_roster set "requested_at" = ${now}
      where "cafe_id" = ${cafe.id} and "user_id" = ${userId}
    `;
    return { ...pending, notify: true };
  }

  // First request from this account. A race between two concurrent first scans
  // is settled by unique (cafe_id, user_id): one inserts and pings, the loser
  // reads as a dedup — no second push.
  try {
    await db`
      insert into cafe_barista_roster
        ("cafe_id", "user_id", "status", "requested_at")
      values (${cafe.id}, ${userId}, 'pending', ${now})
    `;
    return { ...pending, notify: true };
  } catch (err) {
    if (isUniqueViolation(err)) return { ...pending, notify: false };
    throw err;
  }
}

export interface RosterBoard {
  /** The Café's printable poster join-code (#97). */
  posterCode: string;
  pending: { userId: string; name: string; requestedAt: Date }[];
  rostered: { userId: string; name: string; approvedAt: Date }[];
}

/**
 * The owner's Roster board: the poster code to print, the pending requests
 * (the badge source), and the rostered baristas. Null when the Café isn't the
 * caller's (or doesn't exist — indistinguishable, like every ownership miss).
 */
export async function listRoster(
  db: Database,
  cafeId: string,
  ownerUserId: string,
): Promise<RosterBoard | null> {
  const [cafe] = await db<{ poster_code: string }[]>`
    select "poster_code" from cafes
    where "id" = ${cafeId} and "owner_user_id" = ${ownerUserId}
  `;
  if (!cafe) return null;

  const rows = await db<
    {
      user_id: string;
      name: string;
      status: string;
      requested_at: Date;
      approved_at: Date | null;
    }[]
  >`
    select r."user_id", u."name", r."status", r."requested_at", r."approved_at"
    from cafe_barista_roster r join "user" u on u."id" = r."user_id"
    where r."cafe_id" = ${cafeId}
    order by r."created_at" asc
  `;

  return {
    posterCode: cafe.poster_code,
    pending: rows
      .filter((row) => row.status === "pending")
      .map((row) => ({
        userId: row.user_id,
        name: row.name,
        requestedAt: row.requested_at,
      })),
    rostered: rows
      .filter((row) => row.status === "rostered")
      .map((row) => ({
        userId: row.user_id,
        name: row.name,
        // A rostered row always has an approved_at; fall back to requested_at
        // defensively so the contract's non-null date never breaks.
        approvedAt: row.approved_at ?? row.requested_at,
      })),
  };
}

export interface RosterActionInput {
  cafeId: string;
  /** The barista account being approved / removed. */
  userId: string;
  /** The acting CafeOwner — must own the Café. */
  ownerUserId: string;
}

/**
 * Approve a pending request → rostered (#97). False when there is nothing the
 * caller may approve: a foreign café, a foreign caller, or no pending row for
 * this account (all indistinguishable). The ownership check rides in the query
 * via the join to `cafes`, so a rival can never approve into someone's roster.
 */
export async function approveBarista(
  db: Database,
  clock: Clock,
  { cafeId, userId, ownerUserId }: RosterActionInput,
): Promise<boolean> {
  const rows = await db<{ id: string }[]>`
    update cafe_barista_roster r
      set "status" = 'rostered',
          "approved_at" = ${clock.now()},
          "approved_by" = ${ownerUserId}
    from cafes c
    where r."cafe_id" = ${cafeId} and r."user_id" = ${userId}
      and r."status" = 'pending'
      and c."id" = r."cafe_id" and c."owner_user_id" = ${ownerUserId}
    returning r."id"
  `;
  return rows.length > 0;
}

/**
 * Remove a barista (rostered or pending) → none (#97), and INSTANTLY terminate
 * any active Shift they hold at this Café (#99). Both happen in one transaction:
 * the roster row is deleted (a later re-scan raises a fresh request — no
 * denylist, ADR 0013) and every active grant is revoked, so the barista's next
 * scan is rejected server-side and their app drops out of Scanner Mode on next
 * `GET /api/me/shift`. False when there is nothing the caller may remove.
 */
export async function removeBarista(
  db: Database,
  { cafeId, userId, ownerUserId }: RosterActionInput,
  now: Date,
): Promise<boolean> {
  return db.begin(async (tx): Promise<boolean> => {
    const rows = await tx<{ id: string }[]>`
      delete from cafe_barista_roster r
      using cafes c
      where r."cafe_id" = ${cafeId} and r."user_id" = ${userId}
        and c."id" = r."cafe_id" and c."owner_user_id" = ${ownerUserId}
      returning r."id"
    `;
    if (rows.length === 0) return false;

    // Instant termination: end any active shift this barista holds at the Café
    // they were just removed from. The scan path re-checks the grant on every
    // request, so revocation stops scans at once with no client polling.
    await tx`
      update cafe_scanner_grants set "revoked_at" = ${now}
      where "cafe_id" = ${cafeId} and "user_id" = ${userId}
        and "revoked_at" is null and "expires_at" > ${now}
    `;
    return true;
  });
}
