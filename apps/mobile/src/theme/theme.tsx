import { createContext, useContext, type ReactNode } from "react";

import { tokens } from "./theme.generated";

export type ThemeName = "light" | "dark";

const ThemeContext = createContext<ThemeName>("light");

/**
 * Supplies the active semantic theme to a subtree. There is exactly ONE of
 * these at the root, fed by `ThemePreferenceProvider` from the Customer's
 * Settings → ВИГЛЯД choice (#162) — screens don't wrap their own and don't read
 * the OS scheme.
 *
 * A nested provider is reserved for a subtree that deliberately overrides that
 * choice: the Ворожка reveal wraps itself in `theme="dark"` in every theme,
 * because its dark is the brand's magic cue rather than a setting.
 */
export function ThemeProvider({
  theme = "light",
  children,
}: {
  theme?: ThemeName;
  children: ReactNode;
}) {
  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

/**
 * The design tokens with `c` bound to the active theme's semantic colours —
 * components read `t.c.background`, `t.c.primary`, … and never the raw ramps.
 */
export function useTheme() {
  const name = useContext(ThemeContext);
  return {
    ...tokens,
    c: name === "dark" ? tokens.dark : tokens.light,
    themeName: name,
  };
}
