import { router } from "expo-router";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/icon";
import { Heading } from "@/components/text";
import { useTheme } from "@/theme";

/**
 * A back-titled screen header: a 44pt chevron-left control next to a serif
 * screen title (font-display 24). The redesign's subscreens that aren't a
 * role surface use this — Settings (4a) and the register-café subscreen (5d) —
 * where `RoleHeader`'s uppercase kicker doesn't apply. The title is the screen's
 * heading for assistive tech; the back control defaults to `router.back()`.
 */
export function BackHeader({
  title,
  testID,
  onBack,
}: {
  title: string;
  testID?: string;
  onBack?: () => void;
}) {
  const t = useTheme();
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: t.space[2] }}
    >
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel="Назад"
        hitSlop={8}
        onPress={onBack ?? (() => router.back())}
        style={{
          width: 44,
          height: 44,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="chevron-left" size={24} color={t.c["text-secondary"]} />
      </Pressable>
      <Heading size={24} accessibilityRole="header">
        {title}
      </Heading>
    </View>
  );
}
