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
 * (ADR 0009) and the manual-entry ceiling (#21). `en-CA` formats as
 * YYYY-MM-DD, which is exactly Postgres's `date` literal.
 */
const kyivDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Kyiv",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The Kyiv calendar day an instant falls on, as a Postgres date literal. */
export function kyivDayOf(instant: Date): string {
  return kyivDayFormat.format(instant);
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
