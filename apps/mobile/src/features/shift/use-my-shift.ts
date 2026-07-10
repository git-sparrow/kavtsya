import type { MyShiftResponse } from "@kavtsya/shared";
import { useCallback, useEffect, useState } from "react";

import { fetchMyShift } from "@/lib/api";

type MyShift = MyShiftResponse["shift"];

/**
 * The shift this account holds right now (#80): what tells the home screen to
 * show the shift entry and the scanner mode its scope. `undefined` while the
 * first load is in flight — distinct from `null`, "checked, not on shift" —
 * so screens can tell "loading" from "no shift" without a flag.
 */
export function useMyShift() {
  const [shift, setShift] = useState<MyShift | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setShift(await fetchMyShift());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося перевірити зміну");
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchMyShift()
      .then((loaded) => {
        if (active) setShift(loaded);
      })
      .catch((e: unknown) => {
        if (active) {
          setError(
            e instanceof Error ? e.message : "Не вдалося перевірити зміну",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return { shift, error, reload };
}
