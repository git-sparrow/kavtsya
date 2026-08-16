import type { MyShiftResponse } from "@kavtsya/shared";
import { useCallback } from "react";

import { fetchMyShift } from "@/lib/api";
import { useApiResource } from "@/lib/use-api-resource";

/**
 * The shift this account holds right now (#80): what tells the home screen to
 * show the shift entry and the scanner mode its scope. `shift` is null both
 * before the answer arrives and when the answer is "not on shift", so callers
 * that must tell those apart read `loading` — the same split every other read
 * in the app expresses, rather than a tri-state only this hook used.
 */
export function useMyShift() {
  const {
    data: shift,
    error,
    loading,
    reload,
  } = useApiResource<MyShiftResponse["shift"]>(
    useCallback(() => fetchMyShift(), []),
    "Не вдалося перевірити зміну",
  );

  return { shift, error, loading, reload };
}
