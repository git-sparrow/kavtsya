import type { MyShiftResponse } from "@kavtsya/shared";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useMemo,
  useState,
} from "react";

import { useMe } from "@/features/account/me-context";
import { useMyShift } from "@/features/shift/use-my-shift";

import { effectiveMode, type Mode } from "./derive-mode";

type ModeContextValue = {
  /** The surface to show right now (ADR 0015), derived from live facts + excursion. */
  mode: Mode;
  /** True while the account or the shift is still loading — hold off deriving. */
  loading: boolean;
  /** The active shift (Scanner Mode's scope + banner), or null when off duty. */
  shift: MyShiftResponse["shift"];
  /** Enter a non-persisted Mode excursion (owner ⇄ customer); resets on cold launch. */
  switchTo: (mode: Mode) => void;
  /** Drop any excursion and fall back to the derived landing. */
  clearExcursion: () => void;
  /** Re-check "am I on shift?" after joining, ending, or being revoked. */
  reloadShift: () => Promise<void>;
};

const ModeContext = createContext<ModeContextValue | null>(null);

/**
 * Owns the derived Mode for the authenticated app (#96, ADR 0015). It reads the
 * two live facts — the account's roles (`/api/me`) and the active shift
 * (`/api/me/shift`) — and folds in an in-memory excursion override. Because the
 * override lives only in React state, a cold launch always re-derives from
 * server truth: nothing about the Mode is persisted, so a revoked barista or a
 * former owner can never reopen into a dead Mode.
 */
export function ModeProvider({ children }: { children: ReactNode }) {
  const { me } = useMe();
  const { shift, reload: reloadShift } = useMyShift();
  const [override, setOverride] = useState<Mode | null>(null);

  const roles = me?.roles ?? [];
  const hasActiveShift = shift != null;
  // `shift === undefined` is "still checking" — distinct from null, "off duty".
  const loading = me == null || shift === undefined;
  const mode = effectiveMode(roles, hasActiveShift, override);

  const clearExcursion = useCallback(() => setOverride(null), []);

  const value = useMemo<ModeContextValue>(
    () => ({
      mode,
      loading,
      shift: shift ?? null,
      switchTo: setOverride,
      clearExcursion,
      reloadShift,
    }),
    [mode, loading, shift, clearExcursion, reloadShift],
  );

  return <ModeContext value={value}>{children}</ModeContext>;
}

export function useMode(): ModeContextValue {
  const value = use(ModeContext);
  if (!value) throw new Error("useMode must be used within a ModeProvider");
  return value;
}
