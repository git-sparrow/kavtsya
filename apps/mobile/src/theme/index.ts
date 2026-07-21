// The theme public surface, all sourced from Mari's design-tokens.json.
//
// Two ways in, both reading the same tokens:
//   • `useTheme()` — for components (and any future dark subtree). Reacts to the
//     active ThemeProvider: `const t = useTheme(); t.c.<semantic>, t.space[n]`.
//   • `theme` — a static snapshot of the LIGHT semantics for module-level
//     `StyleSheet.create` (which can't call hooks). Screens are light-only today
//     (design brief: "one theme per screen"), so they style against this.
//   • `fontFamily` — RN font-face names (see fonts.ts).
import { tokens } from "./theme.generated";

export { tokens } from "./theme.generated";
export { ThemeProvider, useTheme, type ThemeName } from "./theme";
export { fontAssets, fontFamily } from "./fonts";
export { toShadowStyle, type ShadowToken } from "./shadow";

/** Static light theme for `StyleSheet.create`; `c` is the light semantic map. */
export const theme = {
  ...tokens,
  c: tokens.light,
} as const;
