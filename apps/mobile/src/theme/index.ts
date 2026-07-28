// The theme public surface, all sourced from Mari's design-tokens.json.
//
// One way in for colours: `useTheme()` — `const t = useTheme(); t.c.<semantic>,
// t.space[n]`. It reacts to the active ThemeProvider, which the root feeds from
// the remembered ВИГЛЯД choice (#162). There is deliberately NO static semantic
// snapshot to style against at module level: a frozen light `c` would silently
// paint light colours on a dark screen, which is exactly the bug the single
// preference source exists to prevent. Style inline, or read `tokens` directly
// for the theme-independent scales (space, radius, font).
//
// `fontFamily` — RN font-face names (see fonts.ts).
export { tokens } from "./theme.generated";
export { ThemeProvider, useTheme, type ThemeName } from "./theme";
export {
  DEFAULT_THEME_PREFERENCE,
  parseThemePreference,
  resolveTheme,
  themeChangeAnnouncement,
  type ThemePreference,
} from "./preference";
export {
  ThemePreferenceProvider,
  useThemePreference,
} from "./preference-context";
export { fontAssets, fontFamily } from "./fonts";
export { toShadowStyle, type ShadowToken } from "./shadow";
