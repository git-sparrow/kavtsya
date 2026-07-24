import { Text, View } from "react-native";

import { fontFamily, useTheme } from "@/theme";

/**
 * A small uppercase pill (shared-component catalog §18): the **PRO** marker on
 * growth rows (3a) and the «КАВОВАР» role tag. Non-interactive — the row it sits
 * on stays the touch target — so it is hidden from assistive tech (the row's own
 * label carries the meaning).
 *
 * Colour follows the standing dark rule: `secondary` (deep indigo) + neutral-100
 * in light; in dark it flips to `primary` + `primary-foreground`, because
 * `secondary` is a pale lavender there and would read as a disabled chip.
 */
export function Badge({ label }: { label: string }) {
  const t = useTheme();
  const isDark = t.themeName === "dark";
  const bg = isDark ? t.c.primary : t.c.secondary;
  const fg = isDark ? t.c["primary-foreground"] : t.color.neutral[100];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        alignSelf: "center",
        backgroundColor: bg,
        borderRadius: t.radius.full,
        paddingHorizontal: 10,
        paddingVertical: 3,
      }}
    >
      <Text
        style={{
          color: fg,
          fontSize: 11,
          fontFamily: fontFamily.body.bold,
          letterSpacing: 1,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
