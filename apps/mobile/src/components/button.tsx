import { Pressable, Text } from "react-native";

import { fontFamily, useTheme } from "@/theme";

type Variant = "primary" | "secondary";

/**
 * The app's one button. `busy` shows a spinner-like "..." and disables the
 * press; `disabled` disables without the busy label.
 */
export function Button({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  busy = false,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  busy?: boolean;
}) {
  const t = useTheme();
  const isPrimary = variant === "primary";
  const isDisabled = disabled || busy;

  return (
    <Pressable
      style={[
        {
          borderRadius: t.radius.md,
          paddingVertical: t.space[3],
          minHeight: 48, // ≥44pt touch target (docs/design/INTEGRATION.md a11y)
          alignItems: "center",
          justifyContent: "center",
        },
        isPrimary
          ? { backgroundColor: t.c.primary }
          : {
              marginTop: t.space[2],
              borderWidth: 1,
              borderColor: t.c.border,
            },
        isDisabled && { opacity: 0.6 },
      ]}
      disabled={isDisabled}
      onPress={onPress}
    >
      <Text
        style={{
          color: isPrimary ? t.c["primary-foreground"] : t.c.foreground,
          fontSize: t.font.size.base,
          fontFamily: isPrimary ? fontFamily.body.bold : fontFamily.body.medium,
        }}
      >
        {busy ? "..." : title}
      </Text>
    </Pressable>
  );
}
