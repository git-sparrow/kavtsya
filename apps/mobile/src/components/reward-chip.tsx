import { Pressable, Text } from "react-native";

import { fontFamily, useTheme } from "@/theme";

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
  const t = useTheme();
  return (
    <Pressable
      style={[
        {
          borderWidth: 1,
          borderColor: t.c.border,
          borderRadius: t.radius.md,
          paddingVertical: t.space[2],
          paddingHorizontal: t.space[3],
        },
        active && {
          borderColor: t.c.primary,
          backgroundColor: t.c["primary-surface"],
        },
      ]}
      onPress={onPress}
    >
      <Text
        style={{
          fontSize: t.font.size.base,
          fontFamily: active
            ? fontFamily.body.semibold
            : fontFamily.body.regular,
          color: active ? t.c.foreground : t.c["text-secondary"],
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
