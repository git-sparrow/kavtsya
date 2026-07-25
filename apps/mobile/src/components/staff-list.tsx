import { Text, View } from "react-native";

import { fontFamily, useTheme } from "@/theme";

/**
 * Shared primitives for the CafeOwner's two staff boards — the Barista Roster
 * (5b) and the «Зміна» board (5c). Both list people with the same anatomy (a
 * name over a small meta line, a section count pill, an «on shift» dot), so the
 * pieces live here once rather than drifting between the two screens.
 */

/** Style for a person's name in a staff row (avatar-adjacent primary line). */
export function staffName(t: ReturnType<typeof useTheme>) {
  return {
    fontSize: t.font.size.lg,
    fontFamily: fontFamily.body.semibold,
    color: t.c.foreground,
  };
}

/** Style for the muted meta line under a name («запит N хв тому», «N сканів»). */
export function staffMeta(t: ReturnType<typeof useTheme>) {
  return {
    fontSize: t.font.size.sm,
    fontFamily: fontFamily.body.regular,
    color: t.c["text-muted"],
  };
}

/**
 * A small count pill beside a section label — ЗАПИТИ (accent) / НА ЗМІНІ
 * (success). Decorative: the section label + its list carry the meaning, so it
 * is hidden from assistive tech.
 */
export function CountPill({
  count,
  tint,
}: {
  count: number;
  tint: "accent" | "success";
}) {
  const t = useTheme();
  const bg = tint === "success" ? t.c.success : t.c.primary;
  const fg =
    tint === "success" ? t.c["success-foreground"] : t.c["primary-foreground"];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        minWidth: 22,
        height: 22,
        paddingHorizontal: 7,
        borderRadius: t.radius.full,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{ color: fg, fontSize: 12, fontFamily: fontFamily.body.bold }}
      >
        {count}
      </Text>
    </View>
  );
}

/** The green «on shift» status dot — precedes «на зміні» / «з HH:MM». */
export function ShiftDot() {
  const t = useTheme();
  return (
    <View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: t.c.success,
      }}
    />
  );
}
