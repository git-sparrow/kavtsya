import { ActivityIndicator, Pressable, Text } from "react-native";

import { fontFamily, useTheme } from "@/theme";

/** Button variants (shared-component catalog §1). */
type Variant = "primary" | "secondary" | "quiet";

/**
 * The app's one button. `busy` shows an inline spinner (keeping the title as the
 * accessibility label) and disables the press; `disabled` disables without the
 * spinner. Variants: `primary` (filled CTA), `secondary` (`border-strong`
 * outline — retry/back/fallback), `quiet` (borderless «Пізніше»/«Скасувати»).
 */
export function Button({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  busy = false,
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  const isPrimary = variant === "primary";
  const isQuiet = variant === "quiet";
  const isDisabled = disabled || busy;

  const label = isPrimary
    ? t.c["primary-foreground"]
    : isQuiet
      ? t.c["text-secondary"]
      : t.c.foreground;

  return (
    <Pressable
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
            fontFamily: isPrimary
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
