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
