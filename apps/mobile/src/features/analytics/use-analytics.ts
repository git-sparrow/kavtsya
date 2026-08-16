import { useCallback } from "react";

import type { AnalyticsPeriod, AnalyticsSummary } from "@kavtsya/shared";

import { fetchAnalytics } from "@/lib/api";
import { useFocusedApiResource } from "@/lib/use-api-resource";

/**
 * The Pro CafeOwner's analytics for one Café (#25), for the chosen period.
 * Refetched on focus and whenever the period toggle changes — the numbers move
 * on the scanner's device, so returning to the screen is the natural refresh
 * point (same pattern as `useBalances`). `summary` stays null through the first
 * load and while switching periods, which the screen renders as a spinner: the
 * period is part of what identifies this resource, so switching it clears the
 * previous period's numbers rather than leaving them under the new label.
 */
export function useAnalytics(cafeId: string, period: AnalyticsPeriod) {
  const {
    data: summary,
    error,
    reload,
  } = useFocusedApiResource<AnalyticsSummary>(
    useCallback(() => fetchAnalytics(cafeId, period), [cafeId, period]),
    "Не вдалося завантажити аналітику",
  );

  return { summary, error, reload };
}
