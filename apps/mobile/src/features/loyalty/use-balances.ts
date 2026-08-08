import { useCallback } from "react";

import type { CafeBalancesResponse } from "@kavtsya/shared";

import { fetchBalances } from "@/lib/api";
import { useFocusedApiResource } from "@/lib/use-api-resource";

/**
 * The Customer's per-Café Зернятко balances (#20). Refetched every time the
 * screen regains focus — the balance changes on the CafeOwner's device, not
 * this one, so returning to the home screen is the natural refresh point.
 * `balances` stays null until the first load resolves.
 */
export function useBalances() {
  const {
    data: balances,
    error,
    reload,
  } = useFocusedApiResource<CafeBalancesResponse>(
    useCallback(() => fetchBalances(), []),
    "Не вдалося завантажити зернятка",
  );

  return { balances, error, reload };
}
