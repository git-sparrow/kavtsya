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
