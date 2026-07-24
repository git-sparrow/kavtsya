import { Pressable, View } from "react-native";

import { Icon, type IconName } from "@/components/icon";
import { Heading, SectionLabel } from "@/components/text";
import { useTheme } from "@/theme";

/**
 * The role header used on every owner / Pro screen (shared-component catalog §7):
 * an uppercase kicker («РЕЖИМ КАВОВАРА», «ПРОГРАМА ЛОЯЛЬНОСТІ») over the Café
 * name, with an optional 44pt trailing control (settings on the home, back on a
 * subscreen). No logo ever appears here — the wordmark lives on sign-in + splash
 * only.
 *
 * The Café name is the screen's heading for assistive tech. The trailing control
 * is a plain icon button; pass its glyph, label, and handler via `action`.
 */
export function RoleHeader({
  kicker,
  title,
  action,
}: {
  kicker: string;
  title: string;
  action?: {
    icon: IconName;
    label: string;
    onPress: () => void;
    testID?: string;
  };
}) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: t.space[3],
      }}
    >
      <View style={{ flexShrink: 1, gap: 2 }}>
        <SectionLabel style={{ letterSpacing: 2 }}>{kicker}</SectionLabel>
        <Heading size={23} accessibilityRole="header">
          {title}
        </Heading>
      </View>
      {action ? (
        <Pressable
          testID={action.testID}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          hitSlop={8}
          onPress={action.onPress}
          style={{
            width: 44,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: t.radius.full,
          }}
        >
          <Icon name={action.icon} size={24} color={t.c["text-secondary"]} />
        </Pressable>
      ) : null}
    </View>
  );
}
