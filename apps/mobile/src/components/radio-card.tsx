import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { fontFamily, useTheme } from "@/theme";

/**
 * A single-choice group (shared-component catalog §6): wraps `RadioCard`s so
 * assistive tech announces them as one radio group. Used for the 3b Reward
 * picker and the 7b roster role pick.
 */
export function RadioGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ alignSelf: "stretch", gap: t.space[2] }}
    >
      {children}
    </View>
  );
}

/** The 22px radio dot: a ring that fills with a `link` centre when selected. */
function RadioDot({ selected }: { selected: boolean }) {
  const t = useTheme();
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: t.radius.full,
        borderWidth: selected ? 2 : 1.5,
        borderColor: selected ? t.c.link : t.c["border-strong"],
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {selected ? (
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: t.radius.full,
            backgroundColor: t.c.link,
          }}
        />
      ) : null}
    </View>
  );
}

/**
 * A selectable option card (shared-component catalog §6, grown from the former
 * reward chip): a 48pt row with a leading radio dot and a label. Selected takes
 * `primary-surface` + a 1.5px `primary` border + the filled dot; unselected is a
 * plain `surface` card. Discount rows pass a `trailing` glyph («₴» / «%») so the
 * unit reads inline without a second control.
 */
export function RadioCard({
  label,
  selected,
  onPress,
  trailing,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  trailing?: string;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: t.space[3],
        minHeight: 48,
        paddingVertical: t.space[3],
        paddingHorizontal: t.space[4],
        borderRadius: t.radius.md,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? t.c.primary : t.c.border,
        backgroundColor: selected ? t.c["primary-surface"] : t.c.surface,
      }}
    >
      <RadioDot selected={selected} />
      <Text
        style={{
          flex: 1,
          fontSize: t.font.size.base,
          fontFamily: selected
            ? fontFamily.body.semibold
            : fontFamily.body.regular,
          color: selected ? t.c.foreground : t.c["text-secondary"],
        }}
      >
        {label}
      </Text>
      {trailing ? (
        <Text
          aria-hidden
          style={{
            fontSize: t.font.size.lg,
            fontFamily: fontFamily.body.medium,
            color: t.c["text-muted"],
          }}
        >
          {trailing}
        </Text>
      ) : null}
    </Pressable>
  );
}
