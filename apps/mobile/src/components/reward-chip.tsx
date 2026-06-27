import { Pressable, StyleSheet, Text } from "react-native";

import { colors, radius } from "@/theme/colors";

/** A selectable Reward option in the loyalty-program editor. */
export function RewardChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  chipActive: {
    borderColor: colors.brand,
    backgroundColor: colors.chipActiveBackground,
  },
  chipText: {
    fontSize: 15,
    color: colors.accent,
  },
  chipTextActive: {
    color: colors.brand,
    fontWeight: "600",
  },
});
