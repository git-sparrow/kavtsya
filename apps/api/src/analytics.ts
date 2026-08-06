import type { AnalyticsPeriod, AnalyticsSummary } from "@kavtsya/shared";
import { HOURS_IN_DAY } from "@kavtsya/shared";
import { planForOwnedCafe } from "./cafes";
import type { Clock } from "./clock";
import { kyivDaySql, kyivLocalTimeSql, kyivWindowStart } from "./clock";
import type { Database } from "./db";

/**
 * CafeOwner analytics (#25, ADR 0011): peak hours + repeat-vs-new Customers,
 * derived live from the Purchase ledger (ADR 0010 — the ledger IS the source).
 * The Plan gate reuses #24's `planForOwnedCafe`; no rollups or caching in v1
 * (pilot ledgers are small). Every read slices ONE Café by a Kyiv-day period.
 */

/** How many Kyiv days each preset covers (today inclusive). */
const PERIOD_DAYS: Record<AnalyticsPeriod, number> = { "7d": 7, "30d": 30 };

/**
 * The 30-day window the free teaser (`returningCustomers30d`) and the 30-day
 * analytics summary both report against — the fence keeps them the SAME number
 * (ADR 0011), so the window lives here once.
 */
const TEASER_WINDOW_KYIV_DAYS = PERIOD_DAYS["30d"];

/** Why an analytics read was refused — the wire mapping is exhaustive over it. */
export type AnalyticsRejectionReason = "cafe_not_owned" | "pro_required";

export type AnalyticsOutcome =
  | { ok: true; summary: AnalyticsSummary }
  | { ok: false; reason: AnalyticsRejectionReason };

interface SplitRow {
  active: number;
  new_count: number;
  repeat_count: number;
}

/**
 * Split the Café's **Active Customers** (distinct Customers with ≥1 Purchase in
 * the window ending `windowStart`) into new and repeat, both derived from the
 * ledger alone (ADR 0010). *First ever* is `min(created_at)` per Customer at
 * this Café in Kyiv-day terms — never `cafe_memberships.created_at`, which the
 * #22 backfill stamped `now()` (so membership age ≠ first-visit age). A Customer
 * whose first-ever Kyiv day is on/after `windowStart` is *new* (a first visit
 * exactly at the window's first Kyiv day counts as new); one with any Purchase
 * before it is *repeat*. new + repeat = active by construction. This is the one
 * definition of the split — the teaser and the full summary both read it.
 */
async function customerSplit(
  db: Database,
  cafeId: string,
  windowStart: string,
): Promise<{ active: number; newCustomers: number; repeatCustomers: number }> {
  const [row] = await db<SplitRow[]>`
    with active as (
      select min(${kyivDaySql(db, "created_at")}) as first_day
      from purchases
      where "cafe_id" = ${cafeId}
      group by "customer_user_id"
      having max(${kyivDaySql(db, "created_at")}) >= ${windowStart}::date
    )
    select
      count(*)::int as active,
      count(*) filter (where first_day >= ${windowStart}::date)::int
        as new_count,
      count(*) filter (where first_day < ${windowStart}::date)::int
        as repeat_count
    from active
  `;
  return {
    active: row?.active ?? 0,
    newCustomers: row?.new_count ?? 0,
    repeatCustomers: row?.repeat_count ?? 0,
  };
}

/** The period's Purchases bucketed by Kyiv hour of day (DST-correct), 0–23. */
async function hourlyHistogram(
  db: Database,
  cafeId: string,
  windowStart: string,
): Promise<number[]> {
  const rows = await db<{ hour: number; count: number }[]>`
    select
      extract(hour from ${kyivLocalTimeSql(db, "created_at")})::int as hour,
      count(*)::int as count
    from purchases
    where "cafe_id" = ${cafeId}
      and ${kyivDaySql(db, "created_at")} >= ${windowStart}::date
    group by 1
  `;
  const hourly = new Array<number>(HOURS_IN_DAY).fill(0);
  for (const { hour, count } of rows) hourly[hour] = count;
  return hourly;
}

/**
 * The count of Customers who came back in the last 30 Kyiv days at a Café the
 * caller owns — the single free teaser stat (#25, ADR 0011), shown for Free and
 * Pro owners alike on their café home. Equal by construction to the 30-day
 * summary's `repeatCustomers` (same window, same {@link customerSplit}). No gate
 * here — the caller (`/api/me`) already scopes it to the owner's own Cafés.
 */
export async function countReturningCustomers(
  db: Database,
  clock: Clock,
  cafeId: string,
): Promise<number> {
  const windowStart = kyivWindowStart(clock.now(), TEASER_WINDOW_KYIV_DAYS);
  return (await customerSplit(db, cafeId, windowStart)).repeatCustomers;
}

/**
 * The full analytics summary for a Café the caller owns and that is on Pro
 * (#25). Ownership first (a Café the caller doesn't own is indistinguishable
 * from a missing one), then the Plan — a Free café's read IS the upgrade pitch
 * moment, same order as the campaign gate (#24).
 */
export async function getCafeAnalytics(
  db: Database,
  clock: Clock,
  {
    cafeId,
    ownerUserId,
    period,
  }: {
    cafeId: string;
    ownerUserId: string;
    period: AnalyticsPeriod;
  },
): Promise<AnalyticsOutcome> {
  const plan = await planForOwnedCafe(db, cafeId, ownerUserId);
  if (!plan) return { ok: false, reason: "cafe_not_owned" };
  if (plan !== "pro") return { ok: false, reason: "pro_required" };

  const windowStart = kyivWindowStart(clock.now(), PERIOD_DAYS[period]);
  const [split, hourly] = await Promise.all([
    customerSplit(db, cafeId, windowStart),
    hourlyHistogram(db, cafeId, windowStart),
  ]);

  return {
    ok: true,
    summary: {
      period,
      hourly,
      activeCustomers: split.active,
      newCustomers: split.newCustomers,
      repeatCustomers: split.repeatCustomers,
    },
  };
}
