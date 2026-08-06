import type { Queryable, SqlFragment } from "./db";

/**
 * Injectable clock. App code must take a `Clock` instead of calling
 * `new Date()` / `Date.now()` directly, so tests can pin time deterministically
 * (cross-cutting seam from the PRD).
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** Test helper: a clock frozen at a fixed instant. */
export function fixedClock(instant: Date): Clock {
  return { now: () => new Date(instant) };
}

/**
 * The business day is the Europe/Kyiv calendar day (not server/UTC): Ukrainian
 * cafés must not see a day roll over mid-evening. Shared by the Ворожка pool
 * (ADR 0009) and the manual-entry ceiling (#21).
 *
 * The rule is encoded twice — in JS below and in SQL further down — because both
 * halves of the app bucket by it; the two encodings name the zone from this one
 * constant so they cannot drift (#112).
 */
export const KYIV_TIME_ZONE = "Europe/Kyiv";

/** `en-CA` formats as YYYY-MM-DD, which is exactly Postgres's `date` literal. */
const kyivDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: KYIV_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The Kyiv calendar day an instant falls on, as a Postgres date literal. */
export function kyivDayOf(instant: Date): string {
  return kyivDayFormat.format(instant);
}

/**
 * The oldest Kyiv day of an N-Kyiv-day window ending on `instant`'s Kyiv day
 * (today inclusive), as a Postgres date literal — day 1 of the window is that
 * day itself, so `days = 1` returns today. Computed calendar-wise from the Kyiv
 * date (`Date.UTC` normalizes the month/year underflow), which is exact for a
 * day count regardless of DST. Shared by the campaign audience window (#24) and
 * analytics periods (#25).
 */
export function kyivWindowStart(instant: Date, days: number): string {
  const [y, m, d] = kyivDayOf(instant).split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return new Date(Date.UTC(y, m - 1, d - (days - 1)))
    .toISOString()
    .slice(0, 10);
}

/**
 * The instant the café's business day ends: the next Europe/Kyiv midnight
 * after `instant` — the shift grant's default expiry (#80, ADR 0013). Ukraine
 * switches DST at 03:00/04:00, never at midnight, so midnight always exists
 * exactly once; probing the two possible offsets (+03:00 EEST, +02:00 EET)
 * finds it without a timezone library: the EEST candidate is the true midnight
 * exactly when it already renders as the next Kyiv day.
 */
export function kyivNextMidnight(instant: Date): Date {
  const [y, m, d] = kyivDayOf(instant).split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const utcMidnight = Date.UTC(y, m - 1, d + 1);
  const eest = new Date(utcMidnight - 3 * 3_600_000);
  if (kyivDayOf(eest) !== kyivDayOf(instant)) return eest;
  return new Date(utcMidnight - 2 * 3_600_000);
}

/**
 * What a Kyiv-day fragment buckets: an unqualified column name — the plain case
 * every ledger query wants — or any timestamp expression the caller built as a
 * fragment, which covers everything else (`p."created_at"` under a join alias,
 * the shift board's `coalesce(revoked_at, expires_at)`). Two forms, not three:
 * an alias parameter would only say what the fragment form already says.
 */
type SqlInstant = string | SqlFragment;

/**
 * An instant as Kyiv wall-clock time — the SQL counterpart of the formatter
 * above, and what analytics's hour-of-day histogram buckets on (an evening
 * Purchase belongs to the hour the barista poured it, not its UTC hour).
 *
 * The zone rides in as a bound parameter, so both encodings read the same
 * {@link KYIV_TIME_ZONE} string; the cost is that this fragment can't appear in
 * DDL, so a Kyiv-day expression index would have to re-inline the literal.
 * Nothing needs one — the day is always a filter over a `(cafe_id, created_at)`
 * index, never the index itself.
 */
export function kyivLocalTimeSql(
  sql: Queryable,
  instant: SqlInstant,
): SqlFragment {
  const expr = typeof instant === "string" ? sql`${sql(instant)}` : instant;
  return sql`(${expr} at time zone ${KYIV_TIME_ZONE})`;
}

/**
 * The Kyiv calendar day an instant falls on, as a `date` — the SQL encoding of
 * {@link kyivDayOf}, and the ONE definition every Kyiv-day query composes (#112):
 * the manual-issuance ceiling, the campaign daily cap and audience window, the
 * analytics periods and split, the shift board's «today». Defined once so a DST
 * fix lands in one place instead of eight, and still visible raw SQL — a named
 * postgres.js fragment, not an ORM layer (ADR 0005).
 *
 * Composes against a `date` on the other side (`>= ${windowStart}::date`), never
 * against a timestamp — comparing a day to an instant is what UTC-midnight bugs
 * are made of.
 */
export function kyivDaySql(sql: Queryable, instant: SqlInstant): SqlFragment {
  return sql`${kyivLocalTimeSql(sql, instant)}::date`;
}
