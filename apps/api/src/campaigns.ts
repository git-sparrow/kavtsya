import type { Clock } from "./clock";
import { kyivDayOf, kyivWindowStart } from "./clock";
import type { Database } from "./db";
import { planForOwnedCafe } from "./cafes";
import { getCampaignConfig } from "./platform-config";
import type { PushProvider } from "./push";

/**
 * Push campaigns — the Pro feature (#24, ADR 0011). A campaign is an
 * append-only ledger row (who sent what, where, when, to how many); the send
 * fans out to the Café's recently-active, consenting members' active devices.
 * The Plan gate lives here and in no loyalty path.
 */

/**
 * The audience recency window (grilling 2026-07-10): a member counts as
 * recently-active with ≥1 Purchase at this Café within the last 90 Kyiv days
 * (today inclusive) — one purchase in March must not mean marketing forever.
 */
const RECENCY_WINDOW_KYIV_DAYS = 90;

export interface SendCampaignInput {
  cafeId: string;
  /** The acting CafeOwner — must own the Café. */
  ownerUserId: string;
  /** The push body, already validated at the wire. */
  message: string;
}

/** Why sending was refused — the wire mapping is exhaustive over it (#50). */
export type SendCampaignRejection =
  | "cafe_not_owned"
  | "pro_required"
  | "campaign_limit_reached";

export type SendCampaignOutcome =
  | { ok: true; recipients: number }
  | { ok: false; reason: SendCampaignRejection };

interface AudienceRow {
  user_id: string;
  token_row_id: string;
  token: string;
}

export async function sendCampaign(
  db: Database,
  clock: Clock,
  pushProvider: PushProvider,
  { cafeId, ownerUserId, message }: SendCampaignInput,
): Promise<SendCampaignOutcome> {
  // The requires-Pro guard (#24): ownership first (indistinguishable misses),
  // then the Plan — a Free café's send IS the upgrade pitch moment.
  const plan = await planForOwnedCafe(db, cafeId, ownerUserId);
  if (!plan) return { ok: false, reason: "cafe_not_owned" };
  if (plan !== "pro") return { ok: false, reason: "pro_required" };

  const { dailyLimit } = await getCampaignConfig(db);
  const now = clock.now();
  const kyivDay = kyivDayOf(now);
  // The window's oldest Kyiv day — day 1 of the 90 is today itself (#24).
  const oldestActiveDay = kyivWindowStart(now, RECENCY_WINDOW_KYIV_DAYS);

  // Cap + row + audience in one transaction, serialized per Café by a lock on
  // the café row — two simultaneous taps can't both pass the count. The ledger
  // row is the cap's source of truth (same derived pattern as #21's ceiling).
  const outcome = await db.begin(
    async (
      tx,
    ): Promise<
      | { limited: true }
      | { limited: false; campaignId: string; audience: AudienceRow[] }
    > => {
      await tx`select 1 from cafes where "id" = ${cafeId} for update`;

      const [today] = await tx<{ sent_today: number }[]>`
        select count(*)::int as sent_today from campaigns
        where "cafe_id" = ${cafeId}
          and ("created_at" at time zone 'Europe/Kyiv')::date = ${kyivDay}::date
      `;
      if ((today?.sent_today ?? 0) >= dailyLimit) return { limited: true };

      // The audience (#24, grilling 2026-07-10): members of THIS Café with a
      // Purchase inside the recency window ∩ explicit consent ∩ active device
      // tokens. Consent-but-no-token members simply produce no rows — skipped,
      // never an error.
      const audience = await tx<AudienceRow[]>`
        select u."id" as user_id, t."id" as token_row_id, t."token"
        from cafe_memberships m
        join "user" u on u."id" = m."customer_user_id"
        join push_tokens t on t."user_id" = u."id" and t."active"
        where m."cafe_id" = ${cafeId}
          and u."push_consent"
          and exists (
            select 1 from purchases p
            where p."cafe_id" = m."cafe_id"
              and p."customer_user_id" = u."id"
              and (p."created_at" at time zone 'Europe/Kyiv')::date
                    >= ${oldestActiveDay}::date
          )
      `;
      const recipients = new Set(audience.map((row) => row.user_id)).size;

      // Stamped from the injected clock — the cap counts THIS row against the
      // same Kyiv day the check just derived from that clock.
      const [campaign] = await tx<{ id: string }[]>`
        insert into campaigns
          ("cafe_id", "sent_by_user_id", "message", "recipient_count",
           "created_at")
        values
          (${cafeId}, ${ownerUserId}, ${message}, ${recipients},
           ${clock.now()})
        returning "id"
      `;
      if (!campaign) throw new Error("insert into campaigns returned no row");

      return {
        limited: false,
        campaignId: campaign.id,
        audience: [...audience],
      };
    },
  );
  if (outcome.limited) return { ok: false, reason: "campaign_limit_reached" };

  // Deliver AFTER the transaction — a network call must not hold the café
  // lock. A transport failure here still counted against today's cap: the
  // ledger row exists, which is the conservative direction for the platform's
  // sender reputation (retry tomorrow or the Platform bumps the cap).
  if (outcome.audience.length > 0) {
    const tickets = await pushProvider.send(
      outcome.audience.map((row) => ({ token: row.token, body: message })),
    );
    // Ticket ids are the receipts script's handle (#24 hygiene): one row per
    // delivered message. Transport-rejected messages have no ticket to poll.
    for (const [i, row] of outcome.audience.entries()) {
      const ticketId = tickets[i]?.ticketId;
      if (!ticketId) continue;
      await db`
        insert into push_tickets ("campaign_id", "push_token_id", "ticket_id")
        values (${outcome.campaignId}, ${row.token_row_id}, ${ticketId})
      `;
    }
  }

  return {
    ok: true,
    recipients: new Set(outcome.audience.map((row) => row.user_id)).size,
  };
}
