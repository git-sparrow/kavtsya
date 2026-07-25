import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";

import { toShadowStyle, useTheme } from "@/theme";

/** How a card asks for attention (shared-component catalog §2). */
export type SurfaceEmphasis = "default" | "reward" | "promise";

/**
 * A content card — the design system's `surface` colour over the warm
 * background. `emphasis` picks the border/shadow treatment the mockups call for:
 * - `default` — hairline `border` + the `card` shadow token. The mockups show a
 *   border on every card, and dark needs it (surfaces ≈ background there).
 * - `reward` — 1.5px `primary` border + the `reward` gold glow (reward-ready
 *   cards, offer cards): pairs the two per the token's own description.
 * - `promise` — `primary-surface` fill, no shadow (Берегиня promise/safety
 *   cards, the error-state code hero); a hairline `border` in dark only, where
 *   `primary-surface` collapses onto `surface`.
 *
 * Shadows come from the tokens via `toShadowStyle` — never hand-copied.
 */
export function Surface({
  children,
  style,
  emphasis = "default",
  testID,
}: {
  children: ReactNode;
  style?: ViewStyle;
  emphasis?: SurfaceEmphasis;
  testID?: string;
}) {
  const t = useTheme();
  const isDark = t.themeName === "dark";

  const base: ViewStyle = {
    alignSelf: "stretch",
    backgroundColor: t.c.surface,
    borderRadius: t.radius.lg,
    padding: t.space[5],
    gap: t.space[3],
  };

  let treatment: ViewStyle;
  if (emphasis === "reward") {
    treatment = {
      borderWidth: 1.5,
      borderColor: t.c.primary,
      ...toShadowStyle(t.shadow.reward),
    };
  } else if (emphasis === "promise") {
    treatment = {
      backgroundColor: t.c["primary-surface"],
      borderWidth: isDark ? 1 : 0,
      borderColor: t.c.border,
    };
  } else {
    treatment = {
      borderWidth: 1,
      borderColor: t.c.border,
      ...toShadowStyle(t.shadow.card),
    };
  }

  return (
    <View testID={testID} style={[base, treatment, style]}>
      {children}
    </View>
  );
}
