import type { MyShiftResponse } from "@kavtsya/shared";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  /**
   * The Café name of a shift that just ended (#99), for the brief notice the
   * dispatcher shows as the app drops back to its default Mode — set whenever an
   * active shift becomes null (owner end, removal, or the auto-expire cap seen on
   * foreground). Null when there is nothing to announce.
   */
  endedNotice: string | null;
  /** Dismiss the ended-shift notice. */
  dismissEndedNotice: () => void;
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
  const { shift, loading: checkingShift, reload: reloadShift } = useMyShift();
  const [override, setOverride] = useState<Mode | null>(null);

  const roles = me?.roles ?? [];
  const hasActiveShift = shift != null;
  // A null shift means "off duty" only once the check has settled; until then it
  // is simply not known, which is what `checkingShift` says. A check that
  // settles by FAILING derives the default Mode rather than holding the app on a
  // spinner forever, as the old tri-state did: it can only ever take Scanner
  // Mode away, never hand it out, so the server stays the authority (ADR 0015).
  const loading = me == null || checkingShift;
  const mode = effectiveMode(roles, hasActiveShift, override);

  const clearExcursion = useCallback(() => setOverride(null), []);

  // A shift going from present to null — ended by the barista, the owner, or the
  // auto-expire cap — leaves a brief notice as the app re-derives to its default
  // Mode (#99). Only a real active→null transition triggers it, which is why
  // nothing is judged until the first check settles: before that, null is "we
  // haven't asked yet", not "the shift ended".
  const [endedNotice, setEndedNotice] = useState<string | null>(null);
  const prevShift = useRef<MyShiftResponse["shift"]>(null);
  useEffect(() => {
    if (checkingShift) return;
    if (prevShift.current && shift === null) {
      setEndedNotice(prevShift.current.cafeName);
    }
    prevShift.current = shift;
  }, [checkingShift, shift]);
  const dismissEndedNotice = useCallback(() => setEndedNotice(null), []);

  const value = useMemo<ModeContextValue>(
    () => ({
      mode,
      loading,
      shift,
      switchTo: setOverride,
      clearExcursion,
      reloadShift,
      endedNotice,
      dismissEndedNotice,
    }),
    [
      mode,
      loading,
      shift,
      clearExcursion,
      reloadShift,
      endedNotice,
      dismissEndedNotice,
    ],
  );

  return <ModeContext value={value}>{children}</ModeContext>;
}

export function useMode(): ModeContextValue {
  const value = use(ModeContext);
  if (!value) throw new Error("useMode must be used within a ModeProvider");
  return value;
}
