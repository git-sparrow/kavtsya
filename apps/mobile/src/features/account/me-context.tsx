import type { MeResponse } from "@kavtsya/shared";
import { createContext, type ReactNode, use, useCallback, useEffect, useState } from "react";

import { fetchMe } from "@/lib/api";

type MeContextValue = {
  /** The signed-in account, or null while the first load is in flight or after an error. */
  me: MeResponse | null;
  error: string | null;
  /** Refetch /api/me — call after anything that changes roles or Cafés (e.g. café registration). */
  reload: () => Promise<void>;
};

const MeContext = createContext<MeContextValue | null>(null);

/**
 * Loads /api/me once for the whole authenticated app and shares it, so screens
 * read the account from context instead of refetching or prop-drilling. The
 * profile drives both the Customer/CafeOwner split and the Café list.
 */
export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      setMe(await fetchMe());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка завантаження");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return <MeContext value={{ me, error, reload }}>{children}</MeContext>;
}

export function useMe(): MeContextValue {
  const value = use(MeContext);
  if (!value) throw new Error("useMe must be used within a MeProvider");
  return value;
}
