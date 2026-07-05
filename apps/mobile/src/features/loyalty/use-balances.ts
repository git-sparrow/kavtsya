import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import type { CafeBalancesResponse } from "@kavtsya/shared";

import { fetchBalances } from "@/lib/api";

/**
 * The Customer's per-Café Зернятко balances (#20). Refetched every time the
 * screen regains focus — the balance changes on the CafeOwner's device, not
 * this one, so returning to the home screen is the natural refresh point.
 * `balances` stays null until the first load resolves.
 */
export function useBalances() {
  const [balances, setBalances] = useState<CafeBalancesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setBalances(await fetchBalances());
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не вдалося завантажити зернятка",
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { balances, error, reload };
}
