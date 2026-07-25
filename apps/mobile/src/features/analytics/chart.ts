/**
 * Pure model for the Pro peak-hours histogram (4d/4e) — the bar window, the
 * axis, and the insight copy. Kept separate from the view so the busiest-hour
 * logic and its Ukrainian copy are unit-testable without rendering (RN views are
 * verified on-device via Argent, never in vitest).
 */

/** First Kyiv hour the axis draws — a café's day opens around here. */
export const CHART_FIRST_HOUR = 6;
/** Last Kyiv hour drawn as a bar; the 24:00 gridline closes the axis. */
export const CHART_LAST_HOUR = 23;
/** The four axis ticks under the bars — 06:00 · 12:00 · 18:00 · 24:00. */
export const CHART_TICKS = [6, 12, 18, 24] as const;

/**
 * The hours rendered as bars, left→right: 06:00 … 23:00. The overnight buckets
 * (00:00–05:00) are folded off the visual axis — a coffee shop earns nothing
 * then, so they are noise on the chart. The spoken summary still reads the true
 * peak across the whole day (see `peakHour`), so nothing is hidden from a
 * screen-reader user.
 */
export const CHART_HOURS: number[] = Array.from(
  { length: CHART_LAST_HOUR - CHART_FIRST_HOUR + 1 },
  (_, i) => CHART_FIRST_HOUR + i,
);

/** Two-digit Kyiv hour label, e.g. `09:00`, `24:00`. */
export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/**
 * The busiest Kyiv hour over the whole day (0–23), or null when nothing was
 * earned in the period. Ties resolve to the earliest hour. Computed across all
 * 24 buckets — not just the drawn 06–24 window — so the insight can never
 * contradict the ledger, even for the rare pre-dawn peak (an office bulk order)
 * that falls off the axis.
 */
export function peakHour(hourly: number[]): number | null {
  let best = -1;
  let bestCount = 0;
  hourly.forEach((count, hour) => {
    if (count > bestCount) {
      bestCount = count;
      best = hour;
    }
  });
  return best === -1 ? null : best;
}

/**
 * The chart's two pieces of copy: the promoted serif `headline` insight
 * («Найбільше зернят — близько 19:00», no «за Києвом» qualifier per review) and
 * the `summary` spoken for the otherwise-decorative bars. When the day is empty
 * both degrade to an honest no-data line (the loaded view guards this with its
 * own Берегиня empty state, but the copy stays truthful in isolation).
 */
export function peakInsight(hourly: number[]): {
  headline: string;
  summary: string;
} {
  const peak = peakHour(hourly);
  if (peak === null) {
    return {
      headline: "Поки без піків",
      summary: "Ще немає зернят за цей період",
    };
  }
  const at = hourLabel(peak);
  return {
    headline: `Найбільше зернят — близько ${at}`,
    summary: `Пікові години: найбільше зернят близько ${at}`,
  };
}
