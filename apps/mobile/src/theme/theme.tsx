import { createContext, useContext, type ReactNode } from "react";

import { tokens } from "./theme.generated";

export type ThemeName = "light" | "dark";

const ThemeContext = createContext<ThemeName>("light");

/**
 * Supplies the active semantic theme to a subtree. The brand uses fixed
 * per-screen themes (design brief: "pick one theme per screen; don't mix"), so
 * this defaults to `light` — the calm everyday — rather than following the OS
 * colour scheme. The future dark Ворожка screen wraps itself in `theme="dark"`.
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
