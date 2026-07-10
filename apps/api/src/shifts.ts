import { normalizeMemberCode } from "@kavtsya/shared";
import type { Clock } from "./clock";
import { kyivNextMidnight } from "./clock";
import type { Database } from "./db";
import { isUniqueViolation } from "./db";
import { generateMemberCode } from "./member-code";
import { signShiftInvite, validateShiftInvite } from "./shift-invite";

/**
 * «Зміна» — the shift lifecycle (#80, ADR 0013). Opening a shift mints a
 * short-lived, single-use, café-scoped invite (signed token for the QR path +
 * stored short code for the typed fallback); the barista's accept turns it
 * into a scanner grant on their own account. The grant is the capability:
 * active while now < expires_at and not revoked, dead on its own at the end of
 * the café's business day.
 */

export interface OpenShiftInviteInput {
  cafeId: string;
  /** The acting CafeOwner — must own the Café. */
  ownerUserId: string;
  /** Optional shorter shift (minutes); the Kyiv-midnight ceiling still applies. */
  durationMinutes?: number | undefined;
  /** The app token secret the invite family's key derives from. */
  secret: string;
}

export type OpenShiftInviteOutcome =
  | {
      ok: true;
      inviteToken: string;
      inviteCode: string;
      inviteExpiresAt: Date;
      grantExpiresAt: Date;
    }
  | { ok: false; reason: "cafe_not_owned" };

export async function openShiftInvite(
  db: Database,
  clock: Clock,
  { cafeId, ownerUserId, durationMinutes, secret }: OpenShiftInviteInput,
): Promise<OpenShiftInviteOutcome> {
  // Ownership check, same rule as issuing: a Café that doesn't exist and one
  // the caller doesn't own are indistinguishable.
  const [cafe] = await db<{ id: string }[]>`
    select "id" from cafes
    where "id" = ${cafeId} and "owner_user_id" = ${ownerUserId}
  `;
  if (!cafe) return { ok: false, reason: "cafe_not_owned" };

  const now = clock.now();
  // Default: the grant self-heals at the café's closing time (next Kyiv
  // midnight). An explicit duration only ever shortens — never outlives it.
  const businessDayEnd = kyivNextMidnight(now);
  const requested = durationMinutes
    ? new Date(now.getTime() + durationMinutes * 60_000)
    : businessDayEnd;
  const grantExpiresAt =
    requested < businessDayEnd ? requested : businessDayEnd;

  const invite = signShiftInvite(cafeId, { clock, secret });

  // The short-code fallback shares the member code's format (#21) — and its
  // mint loop: a collision with any past invite's code just redraws.
  for (;;) {
    const inviteCode = generateMemberCode();
    try {
      await db`
        insert into cafe_shift_invites
          ("jti", "code", "cafe_id", "created_by",
           "expires_at", "grant_expires_at")
        values
          (${invite.jti}, ${inviteCode}, ${cafeId}, ${ownerUserId},
           ${invite.expiresAt}, ${grantExpiresAt})
      `;
      return {
        ok: true,
        inviteToken: invite.token,
        inviteCode,
        inviteExpiresAt: invite.expiresAt,
        grantExpiresAt,
      };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
}

/**
 * Whether `userId` holds an active scanner grant at `cafeId` — the ADR 0013
 * capability check the two counter paths (issue + confirm) widen on. Active =
 * not revoked and not yet expired; expiry compares against the injected
 * clock's instant, so the self-healing time-box is testable.
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
 * Revoke one shift now (#80): the un-revoked grant at the owner's own Café.
 * False when there is nothing the caller may revoke — a foreign café's grant,
 * a foreign caller, or a grant already gone (all indistinguishable, like every
 * ownership miss).
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
 * The active shift this account holds, or null — what the barista's app polls
 * to know it is (still) in scanner mode. Latest accept wins if several are
 * somehow live at once.
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
 * How the barista presented the invite: the scanned signed token or the typed
 * short code — the same split as the Purchase's QR/member-code identity (#21).
 */
export type ShiftInvitePresentation =
  | { source: "token"; token: string }
  | { source: "code"; code: string };

export interface AcceptShiftInviteInput {
  /** The barista whose account the grant attaches to. */
  userId: string;
  invite: ShiftInvitePresentation;
  /** The app token secret the invite family's key derives from. */
  secret: string;
}

/** Why accepting was refused — the wire mapping is exhaustive over it (#50). */
export type AcceptShiftInviteRejection =
  | "invalid_invite"
  | "expired_invite"
  | "invite_used";

export type AcceptShiftInviteOutcome =
  | { ok: true; cafeId: string; cafeName: string; expiresAt: Date }
  | { ok: false; reason: AcceptShiftInviteRejection };

interface InviteRow {
  jti: string;
  cafe_id: string;
  cafe_name: string;
  created_by: string;
  expires_at: Date;
  grant_expires_at: Date;
}

async function selectInviteBy(
  db: Database,
  where: { jti: string } | { code: string },
): Promise<InviteRow | undefined> {
  const rows =
    "jti" in where
      ? await db<InviteRow[]>`
          select i."jti", i."cafe_id", c."name" as cafe_name, i."created_by",
                 i."expires_at", i."grant_expires_at"
          from cafe_shift_invites i join cafes c on c."id" = i."cafe_id"
          where i."jti" = ${where.jti}
        `
      : await db<InviteRow[]>`
          select i."jti", i."cafe_id", c."name" as cafe_name, i."created_by",
                 i."expires_at", i."grant_expires_at"
          from cafe_shift_invites i join cafes c on c."id" = i."cafe_id"
          where i."code" = ${where.code}
        `;
  return rows[0];
}

export async function acceptShiftInvite(
  db: Database,
  clock: Clock,
  { userId, invite, secret }: AcceptShiftInviteInput,
): Promise<AcceptShiftInviteOutcome> {
  let row: InviteRow | undefined;

  if (invite.source === "token") {
    const validated = validateShiftInvite(invite.token, { clock, secret });
    if (!validated.valid) {
      return {
        ok: false,
        reason:
          validated.reason === "expired" ? "expired_invite" : "invalid_invite",
      };
    }
    row = await selectInviteBy(db, { jti: validated.jti });
    // A verified token whose row is gone or names another Café is not an
    // invite we ever showed — the tampered/wrong-café cases read as invalid.
    if (!row || row.cafe_id !== validated.cafeId) {
      return { ok: false, reason: "invalid_invite" };
    }
  } else {
    row = await selectInviteBy(db, {
      code: normalizeMemberCode(invite.code),
    });
    if (!row) return { ok: false, reason: "invalid_invite" };
    // The token path's validator owns expiry for the QR; the typed path reads
    // the same instant off the row.
    if (clock.now().getTime() > row.expires_at.getTime()) {
      return { ok: false, reason: "expired_invite" };
    }
  }

  // One invite admits one barista: the accept and the used-invite check are
  // the same write (`invite_jti unique`) — a photographed invite can't admit
  // a second account, no matter how the two accepts race.
  try {
    await db`
      insert into cafe_scanner_grants
        ("cafe_id", "user_id", "invite_jti", "expires_at", "created_by")
      values
        (${row.cafe_id}, ${userId}, ${row.jti},
         ${row.grant_expires_at}, ${row.created_by})
    `;
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: "invite_used" };
    throw err;
  }

  return {
    ok: true,
    cafeId: row.cafe_id,
    cafeName: row.cafe_name,
    expiresAt: row.grant_expires_at,
  };
}
