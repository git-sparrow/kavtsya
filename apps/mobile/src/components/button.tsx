import { Pressable, StyleSheet, Text } from "react-native";

import { colors, radius } from "@/theme/colors";

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
  const isPrimary = variant === "primary";
  const isDisabled = disabled || busy;

  return (
    <Pressable
      style={[
        isPrimary ? styles.primary : styles.secondary,
        isDisabled && styles.disabled,
      ]}
      disabled={isDisabled}
      onPress={onPress}
    >
      <Text style={isPrimary ? styles.primaryText : styles.secondaryText}>
        {busy ? "..." : title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primary: {
    backgroundColor: colors.brand,
    borderRadius: radius,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: {
    color: colors.onBrand,
    fontSize: 16,
    fontWeight: "600",
  },
  secondary: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryText: {
    color: colors.brand,
    fontSize: 16,
  },
  disabled: {
    opacity: 0.6,
  },
});
