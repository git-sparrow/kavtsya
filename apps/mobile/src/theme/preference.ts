import type { ColorSchemeName } from "react-native";

import type { ThemeName } from "./theme";

/**
 * What the Customer chose in Settings → ВИГЛЯД (#162, redesign turn 10a):
 * follow the phone, or pin one theme. Three states, not a boolean — a binary
 * switch can't express «як у системі», so anyone on OS auto-dark would end up
 * flipping it by hand twice a day (10b, rejected).
 */
export type ThemePreference = "system" | "light" | "dark";

/** The default before anything is chosen, and the fallback for junk. */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

const PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

/**
 * The one theme the app renders in. «Системна» defers to the phone; an explicit
 * choice always wins, including when the phone reports no scheme at all. An
 * unknown scheme resolves to `light` — the calm everyday, and the theme the app
 * shipped with before this preference existed.
 *
 * This is the ONLY place the OS scheme is turned into a theme: screens read the
 * resolved theme from the provider instead of calling `useColorScheme()`
 * themselves, so an explicit «Світла»/«Темна» can never be ignored by a screen
 * that still asks the OS directly.
 */
export function resolveTheme(
  preference: ThemePreference,
  // `useColorScheme()` widens to null/undefined on a platform that can't report
  // one, and to "unspecified" when the OS has no preference of its own.
  osScheme: ColorSchemeName | null | undefined,
): ThemeName {
  if (preference !== "system") return preference;
  return osScheme === "dark" ? "dark" : "light";
}

/**
 * What came back from the device store, made safe: an unreadable value (junk, a
 * hand-edited entry, or a choice written by a future version) degrades to the
 * default rather than throwing on launch.
 */
export function parseThemePreference(stored: string | null): ThemePreference {
  return PREFERENCES.find((p) => p === stored) ?? DEFAULT_THEME_PREFERENCE;
}

/** The label a screen-reader hears when the theme changes under it. */
export function themeChangeAnnouncement(preference: ThemePreference): string {
  const name = {
    system: "системна",
    light: "світла",
    dark: "темна",
  }[preference];
  return `Тему змінено: ${name}`;
}
