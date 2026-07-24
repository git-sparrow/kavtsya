import { Children, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { Badge } from "@/components/badge";
import { Icon, type IconName } from "@/components/icon";
import { Toggle } from "@/components/toggle";
import { fontFamily, toShadowStyle, useTheme } from "@/theme";

/**
 * A grouped list container (shared-component catalog §16): a `surface` card with
 * a hairline `border`, holding `ListRow`s / `ToggleRow`s separated by hairline
 * dividers. The card clips its rows so a row's press highlight never spills past
 * the rounded corners. Used for the owner home's management / growth menus (3a)
 * and Settings groups (4a).
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

/** Shared row frame: 52pt min height, leading icon, pressed highlight. */
function rowStyle(t: ReturnType<typeof useTheme>) {
  return ({ pressed }: { pressed: boolean }) => ({
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: t.space[3],
    minHeight: 52,
    paddingHorizontal: t.space[4],
    paddingVertical: t.space[2],
    backgroundColor: pressed ? t.c["primary-surface"] : "transparent",
  });
}

/** Title (+ optional caption) column shared by both row kinds. */
function RowText({ title, caption }: { title: string; caption?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text
        style={{
          fontSize: 15,
          fontFamily: fontFamily.body.semibold,
          color: t.c.foreground,
        }}
      >
        {title}
      </Text>
      {caption ? (
        <Text
          style={{
            fontSize: 12.5,
            fontFamily: fontFamily.body.regular,
            color: t.c["text-muted"],
          }}
        >
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * One navigation / action row inside a `ListGroup` (§16): a leading line icon, a
 * title, an optional caption + **PRO** badge, and a trailing chevron. The whole
 * 52pt row is the touch target. `chevron={false}` drops the disclosure arrow for
 * an action row that stays on-screen (e.g. «Зареєструвати ще одну»). When
 * `badge` is set the accessible name folds it in (the pill is decorative), so a
 * screen-reader hears «Аналітика, PRO».
 */
export function ListRow({
  icon,
  title,
  caption,
  badge,
  chevron = true,
  onPress,
  testID,
}: {
  icon: IconName;
  title: string;
  caption?: string;
  badge?: string;
  chevron?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const t = useTheme();
  const label = [title, caption, badge].filter(Boolean).join(", ");
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={rowStyle(t)}
    >
      <Icon name={icon} size={24} color={t.c["text-secondary"]} />
      <RowText title={title} caption={caption} />
      {badge ? <Badge label={badge} /> : null}
      {chevron ? (
        <Icon name="chevron-right" size={20} color={t.c["text-muted"]} />
      ) : null}
    </Pressable>
  );
}

/**
 * A settings toggle row (§16 toggle variant + §17): title, scope caption, and a
 * trailing `Toggle` knob. The **whole row is the `switch`** — one accessible
 * node carrying the label, caption, and on/off state, announced увімкнено /
 * вимкнено — so the entire 52pt row toggles and a screen-reader hears a single
 * control rather than a switch nested in a button (the knob itself is
 * decorative). `disabled` freezes it while the choice is saving.
 */
export function ToggleRow({
  title,
  caption,
  value,
  onValueChange,
  disabled = false,
  testID,
}: {
  title: string;
  caption?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={caption ? `${title}. ${caption}` : title}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={rowStyle(t)}
    >
      <RowText title={title} caption={caption} />
      <Toggle value={value} />
    </Pressable>
  );
}
