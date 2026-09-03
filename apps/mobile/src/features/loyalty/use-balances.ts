import type { CafeBalance, CafeBalancesResponse } from "@kavtsya/shared";
import { isRedemptionReady } from "@kavtsya/shared";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";

import { fetchBalances } from "@/lib/api";
import { useFocusedApiResource } from "@/lib/use-api-resource";

/**
 * How often to re-read while a Reward is claimable. Deliberately the same
 * cadence as the Redemption sheet (`redemption-sheet.tsx`): both are watching
 * for the same event — the CafeOwner's confirm — so they must not disagree
 * about how quickly it is noticed.
 */
const CLAIMABLE_POLL_MS = 2500;

/**
 * Whether a Redemption could be confirmed against this Café right now — the only
 * state in which the balance can move without this device doing anything. An
 * archived Café is frozen (#81, ADR 0014): its Зернятка can neither grow nor be
 * spent, so nothing about it can change server-side and watching it is waste.
 */
function isClaimable(cafe: CafeBalance): boolean {
  return !cafe.archived && isRedemptionReady(cafe);
}

/**
 * The Customer's per-Café Зернятко balances (#20). Refetched every time the
 * screen regains focus — the balance changes on the CafeOwner's device, not this
 * one, so returning to the home screen is the natural refresh point.
 * `balances` stays null until the first load resolves.
 *
 * Focus alone does not cover the counter, which is the moment this hook has to
 * survive. The Customer is standing there *looking* at the screen, so it never
 * blurs, while the CafeOwner confirms the Redemption on their own device. Home
 * would go on offering «Як отримати» for a Reward already claimed until the
 * Customer happened to navigate away and back — a card inviting an action the
 * server will now refuse.
 *
 * So while any Café is claimable we keep the list live. Earning needs no
 * equivalent: a Purchase always produces a Ворожка, and the reveal's arrival
 * already reloads this list (`reloadSignal` in `CafeBalances`). The poll is
 * scoped twice over — to focus, and to a Reward actually being claimable — so a
 * Customer collecting toward their next Reward pays nothing for it, and it stops
 * by itself the moment the confirm lands and the balance drops.
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

  const claimable = balances?.some(isClaimable) ?? false;

  // Focus-scoped rather than a plain effect: a blurred home is still mounted
  // (the Customer stepped into Settings), and a screen nobody is looking at has
  // nothing to keep in step.
  useFocusEffect(
    useCallback(() => {
      if (!claimable) return;
      const timer = setInterval(() => void reload(), CLAIMABLE_POLL_MS);
      return () => clearInterval(timer);
    }, [claimable, reload]),
  );

  return { balances, error, reload };
}
