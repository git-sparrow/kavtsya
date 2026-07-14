import { normalizeMemberCode } from "@kavtsya/shared";
import type { Clock } from "./clock";
import type { Database } from "./db";
import { isUniqueViolation } from "./db";

/**
 * The Barista Roster (#97, ADR 0013): a Café's persistent, café-scoped
 * trusted-barista list plus the non-secret wall poster that starts a request.
 * States are just rostered / pending / none (no denylist) — a `cafe_barista_roster`
 * row is `pending` (a raised request) or `rostered` (approved), and no row is
 * none. Security rests on the roster, not the poster: scanning the code only
 * ever IDENTIFIES the Café, and a non-rostered scan grants nothing — it raises a
 * deduped, rate-limited pending request the owner must approve.
 *
 * Starting a Shift from a rostered scan is the next slice (#98); here a scan
 * only ever raises a request or confirms the account is already rostered.
 */

/**
 * How long a raised request silences repeat scans of the same account before a
 * fresh owner ping is allowed again — the rate-limit against repeat/decline
 * spam. Tunable; a module constant like the shift auto-expire backstop, not
 * Platform config (v1 has no reason to vary it per café).
 */
export const ROSTER_REQUEST_COOLDOWN_MS = 10 * 60_000;

/** Why the poster scan resolved as it did — the route maps it to the wire (#50). */
export type RaiseRosterRequestOutcome =
  | { status: "unknown_poster" }
  | { status: "rostered"; cafeName: string }
  | {
      status: "pending";
      cafeName: string;
      /** The owner to notify — the operational push target (#97, not consent-gated). */
      ownerUserId: string;
      /** Whether THIS scan should push: false when deduped inside the cooldown. */
      notify: boolean;
    };

export interface RaiseRosterRequestInput {
  /** The scanned (or typed) poster code — normalized before lookup, like the member code (#21). */
  posterCode: string;
  /** The barista's own account the request (and later the Shift) attaches to. */
  userId: string;
}

export async function raiseRosterRequest(
  db: Database,
  clock: Clock,
  { posterCode, userId }: RaiseRosterRequestInput,
): Promise<RaiseRosterRequestOutcome> {
  const [cafe] = await db<
    { id: string; name: string; owner_user_id: string }[]
  >`
    select "id", "name", "owner_user_id" from cafes
    where "poster_code" = ${normalizeMemberCode(posterCode)}
  `;
  if (!cafe) return { status: "unknown_poster" };

  // The owner is fully privileged at their own Café by construction — scanning
  // their own poster raises nothing.
  if (cafe.owner_user_id === userId) {
    return { status: "rostered", cafeName: cafe.name };
  }

  const [existing] = await db<{ status: string; requested_at: Date }[]>`
    select "status", "requested_at" from cafe_barista_roster
    where "cafe_id" = ${cafe.id} and "user_id" = ${userId}
  `;
  if (existing?.status === "rostered") {
    return { status: "rostered", cafeName: cafe.name };
  }

  const now = clock.now();
  const pending = {
    status: "pending" as const,
    cafeName: cafe.name,
    ownerUserId: cafe.owner_user_id,
  };

  if (existing) {
    // A pending request already stands. Silence repeat scans inside the
    // cooldown; once it elapses, refresh the timestamp and let the owner be
    // pinged again (they may have missed the first).
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
 * Remove a barista (rostered or pending) → none (#97): the row is deleted, so a
 * later re-scan raises a fresh request (a fired barista's re-scan is covered by
 * "the owner never approves" — no denylist, ADR 0013). False when there is
 * nothing the caller may remove.
 */
export async function removeBarista(
  db: Database,
  { cafeId, userId, ownerUserId }: RosterActionInput,
): Promise<boolean> {
  const rows = await db<{ id: string }[]>`
    delete from cafe_barista_roster r
    using cafes c
    where r."cafe_id" = ${cafeId} and r."user_id" = ${userId}
      and c."id" = r."cafe_id" and c."owner_user_id" = ${ownerUserId}
    returning r."id"
  `;
  return rows.length > 0;
}
