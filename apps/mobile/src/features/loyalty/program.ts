/**
 * Loyalty-program editor logic that doesn't need React — kept pure so the
 * threshold stepper and its unit tests share one rule.
 */

/**
 * Move the Зернятко threshold by `delta`, clamped to the redemption floor of 1
 * (a threshold below 1 has no meaning — every Purchase would already redeem).
 * A non-integer or NaN `current` (e.g. a half-typed field) recovers to a clean
 * integer: it is treated as 1 before the step, so a tap always lands somewhere
 * sensible rather than propagating the bad value.
 */
export function clampThreshold(current: number, delta: number): number {
  const base = Number.isFinite(current) ? Math.trunc(current) : 1;
  return Math.max(1, base + delta);
}
