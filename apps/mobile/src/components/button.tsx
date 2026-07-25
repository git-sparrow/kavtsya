import type { Ref } from "react";
import { ActivityIndicator, Pressable, Text, type View } from "react-native";

import { fontFamily, useTheme } from "@/theme";

/** Button variants (shared-component catalog §1). */
type Variant = "primary" | "secondary" | "quiet" | "danger";

/**
 * The app's one button. `busy` shows an inline spinner (keeping the title as the
 * accessibility label) and disables the press; `disabled` disables without the
 * spinner. Variants: `primary` (filled CTA), `secondary` (`border-strong`
 * outline — retry/back/fallback), `quiet` (borderless «Пізніше»/«Скасувати»),
 * `danger` (solid `danger` — destructive confirms only, 6b/7d).
 *
 * `ref` exposes the pressable so a dialog can place the initial screen-reader
 * focus on it (ConfirmDialog focuses the safe action on a danger confirm).
 */
export function Button({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  busy = false,
  testID,
  ref,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
  ref?: Ref<View>;
}) {
  const t = useTheme();
  const isPrimary = variant === "primary";
  const isQuiet = variant === "quiet";
  const isDanger = variant === "danger";
  const isFilled = isPrimary || isDanger;
  const isDisabled = disabled || busy;

  // On a solid `danger` fill the label is white in light — but dark `danger` is
  // salmon, where white fails AA, so the handoff pins the dark label to the
  // background indigo (not `danger-foreground`, whose dark value is a near-black
  // red the design did not choose).
  const dangerLabel =
    t.themeName === "dark" ? t.c.background : t.c["danger-foreground"];

  const label = isPrimary
    ? t.c["primary-foreground"]
    : isDanger
      ? dangerLabel
      : isQuiet
        ? t.c["text-secondary"]
        : t.c.foreground;

  return (
    <Pressable
      ref={ref}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy }}
      style={[
        {
          borderRadius: t.radius.md,
          paddingVertical: t.space[3],
          minHeight: isQuiet ? 44 : 48, // ≥44pt touch target (a11y floor)
          alignItems: "center",
          justifyContent: "center",
        },
        isPrimary && { backgroundColor: t.c.primary },
        isDanger && { backgroundColor: t.c.danger },
        variant === "secondary" && {
          marginTop: t.space[2],
          borderWidth: 1,
          borderColor: t.c["border-strong"],
        },
        isDisabled && { opacity: 0.6 },
      ]}
      disabled={isDisabled}
      onPress={onPress}
    >
      {busy ? (
        <ActivityIndicator color={label} />
      ) : (
        <Text
          style={{
            color: label,
            fontSize: t.font.size.base,
            fontFamily: isFilled
              ? fontFamily.body.bold
              : isQuiet
                ? fontFamily.body.semibold
                : fontFamily.body.medium,
          }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}
