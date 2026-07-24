import { Text, View } from "react-native";

import { initial } from "@/lib/initial";
import { fontFamily, useTheme } from "@/theme";

/**
 * A round monogram avatar (shared-component catalog §15): a `primary-surface`
 * circle with the name's serif initial in `link` (light) / `primary` (dark).
 *
 * Standing dark rule: `primary-surface` collapses onto `surface` in dark, so a
 * dark avatar gains a 1px `primary` ring — without it the circle vanishes.
 *
 * Decorative: the initial repeats the adjacent name, which carries identity for
 * assistive tech, so the avatar is hidden from it.
 */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const t = useTheme();
  const isDark = t.themeName === "dark";
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: t.radius.full,
        backgroundColor: t.c["primary-surface"],
        alignItems: "center",
        justifyContent: "center",
        ...(isDark ? { borderWidth: 1, borderColor: t.c.primary } : null),
      }}
    >
      <Text
        style={{
          fontSize: size * 0.45,
          fontFamily: fontFamily.display.semibold,
          color: isDark ? t.c.primary : t.c.link,
        }}
      >
        {initial(name)}
      </Text>
    </View>
  );
}
