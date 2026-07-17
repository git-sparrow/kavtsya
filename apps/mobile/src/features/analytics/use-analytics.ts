import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import type { AnalyticsPeriod, AnalyticsSummary } from "@kavtsya/shared";

import { fetchAnalytics } from "@/lib/api";

/**
 * The Pro CafeOwner's analytics for one Café (#25), for the chosen period.
 * Refetched on focus and whenever the period toggle changes — the numbers move
 * on the scanner's device, so returning to the screen is the natural refresh
 * point (same pattern as `useBalances`). `summary` stays null through the first
 * load and while switching periods, which the screen renders as a spinner.
 */
export function useAnalytics(cafeId: string, period: AnalyticsPeriod) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setSummary(await fetchAnalytics(cafeId, period));
      setError(null);
    } catch (e) {
      setSummary(null);
      setError(
        e instanceof Error ? e.message : "Не вдалося завантажити аналітику",
      );
    }
  }, [cafeId, period]);

  useFocusEffect(
    useCallback(() => {
      // Clear the previous period's numbers so the toggle can't briefly show
      // stale bars against the new label.
      setSummary(null);
      void reload();
    }, [reload]),
  );

  return { summary, error, reload };
}
