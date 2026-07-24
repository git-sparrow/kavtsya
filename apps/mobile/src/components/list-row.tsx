import { Children, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { Badge } from "@/components/badge";
import { Icon, type IconName } from "@/components/icon";
import { fontFamily, toShadowStyle, useTheme } from "@/theme";

/**
 * A grouped list container (shared-component catalog §16): a `surface` card with
 * a hairline `border`, holding `ListRow`s separated by hairline dividers. The
 * card clips its rows so a row's press highlight never spills past the rounded
 * corners. Used for the owner home's management / growth menus (3a) and Settings
 * groups (4a).
 */
export function ListGroup({ children }: { children: ReactNode }) {
  const t = useTheme();
  const rows = Children.toArray(children);
  return (
    <View
      style={[
        {
          alignSelf: "stretch",
          backgroundColor: t.c.surface,
          borderWidth: 1,
          borderColor: t.c.border,
          borderRadius: t.radius.md,
          overflow: "hidden",
        },
        toShadowStyle(t.shadow.card),
      ]}
    >
      {rows.map((row, i) => (
        <View key={i}>
          {i > 0 ? (
            <View style={{ height: 1, backgroundColor: t.c.border }} />
          ) : null}
          {row}
        </View>
      ))}
    </View>
  );
}

/**
 * One navigation row inside a `ListGroup` (§16): a leading line icon, a title,
 * an optional **PRO** badge, and a trailing chevron. The whole 52pt row is the
 * touch target. When `badge` is set the accessible name folds it into the label
 * (the pill itself is decorative), so a screen-reader hears «Аналітика, PRO».
 */
export function ListRow({
  icon,
  title,
  badge,
  onPress,
  testID,
}: {
  icon: IconName;
  title: string;
  badge?: string;
  onPress: () => void;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${title}, ${badge}` : title}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: t.space[3],
        minHeight: 52,
        paddingHorizontal: t.space[4],
        paddingVertical: t.space[2],
        backgroundColor: pressed ? t.c["primary-surface"] : "transparent",
      })}
    >
      <Icon name={icon} size={24} color={t.c["text-secondary"]} />
      <Text
        style={{
          flex: 1,
          fontSize: 15,
          fontFamily: fontFamily.body.semibold,
          color: t.c.foreground,
        }}
      >
        {title}
      </Text>
      {badge ? <Badge label={badge} /> : null}
      <Icon name="chevron-right" size={20} color={t.c["text-muted"]} />
    </Pressable>
  );
}
