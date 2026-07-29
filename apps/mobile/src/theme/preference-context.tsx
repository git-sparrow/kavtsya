import * as SecureStore from "expo-secure-store";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AccessibilityInfo, useColorScheme } from "react-native";

import {
  DEFAULT_THEME_PREFERENCE,
  parseThemePreference,
  resolveTheme,
  themeChangeAnnouncement,
  type ThemePreference,
} from "./preference";
import { ThemeProvider } from "./theme";

/**
 * Where the choice lives. ONE entry for the device, not one per account (unlike
 * the member code, #91): a theme is a property of *this phone* — «Системна» is
 * itself a device-level notion — and it must already be right on the sign-in
 * screens, where there is no account yet.
 */
const STORAGE_KEY = "kavtsya.theme_preference";

type ThemePreferenceValue = {
  /** The stored choice: «Системна» / «Світла» / «Темна». */
  preference: ThemePreference;
  /** Apply a choice — instantly, and remembered for the next launch. */
  setPreference: (next: ThemePreference) => void;
};

const ThemePreferenceContext = createContext<ThemePreferenceValue | null>(null);

/**
 * Owns the app's theme (#162, turn 10a): it reads the remembered choice off the
 * device, folds in the OS colour scheme for «Системна», and hands the result to
 * the single root `ThemeProvider`. Screens never read `useColorScheme()`
 * themselves — that would put the same state in two places and would silently
 * ignore an explicit «Світла»/«Темна» (product floor).
 *
 * The one sanctioned exception is a subtree that deliberately overrides the
 * preference: the Ворожка reveal wraps itself in `theme="dark"` because its dark
 * is the brand's magic cue, not part of this setting.
 *
 * Nothing renders until the stored choice is known. The splash is still up at
 * that point (it is hidden from *inside* this subtree), so a Customer on «Темна»
 * never sees a light frame first.
 */
export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const osScheme = useColorScheme();
  const [preference, setStored] = useState<ThemePreference>(
    DEFAULT_THEME_PREFERENCE,
  );
  // Whether the store has answered yet — distinct from the value it answered
  // with, since "not read yet" and "chose Системна" must not look alike.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      let stored: string | null = null;
      try {
        stored = await SecureStore.getItemAsync(STORAGE_KEY);
      } catch {
        // An unreadable store must never wedge launch — fall through to the
        // default and let the next choice rewrite the entry.
      }
      if (!active) return;
      setStored(parseThemePreference(stored));
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      // Re-picking the current option changes nothing, so it says nothing and
      // writes nothing: a radio group is left through another option, never
      // re-confirmed, and a repeated «Тему змінено» would be pure noise.
      if (next === preference) return;
      // Otherwise it applies on tap: no confirm, no restart — the Settings
      // screen repaints under the finger and is its own live preview.
      setStored(next);
      AccessibilityInfo.announceForAccessibility(themeChangeAnnouncement(next));
      // Persisting is best-effort: the choice is already live either way, so a
      // failed write costs the *next* launch, never this tap.
      void SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {});
    },
    [preference],
  );

  const value = useMemo<ThemePreferenceValue>(
    () => ({ preference, setPreference }),
    [preference, setPreference],
  );

  if (!loaded) return null;

  return (
    <ThemePreferenceContext value={value}>
      <ThemeProvider theme={resolveTheme(preference, osScheme)}>
        {children}
      </ThemeProvider>
    </ThemePreferenceContext>
  );
}

/** The Settings ВИГЛЯД section's read/write handle on the theme choice. */
export function useThemePreference(): ThemePreferenceValue {
  const value = use(ThemePreferenceContext);
  if (!value) {
    throw new Error(
      "useThemePreference must be used within a ThemePreferenceProvider",
    );
  }
  return value;
}
