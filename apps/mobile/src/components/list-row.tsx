import { Children, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { Badge } from "@/components/badge";
import { Icon, type IconName } from "@/components/icon";
import { RadioDot } from "@/components/radio-card";
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

/**
 * How a row reads: `default`, or `danger` for the one row in Settings that
 * destroys something («Видалити акаунт», #143 screen 4a). Danger colours the
 * title and the leading glyph — the row still only *opens* the confirm dialog,
 * so the colour is a warning, not the action.
 */
export type RowTone = "default" | "danger";

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
function RowText({
  title,
  caption,
  tone = "default",
}: {
  title: string;
  caption?: string;
  tone?: RowTone;
}) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text
        style={{
          fontSize: 15,
          fontFamily: fontFamily.body.semibold,
          color: tone === "danger" ? t.c.danger : t.c.foreground,
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
  tone = "default",
  disabled = false,
  onPress,
  testID,
}: {
  icon: IconName;
  title: string;
  caption?: string;
  badge?: string;
  chevron?: boolean;
  tone?: RowTone;
  /**
   * Freeze the row while its action is in flight — same contract as `ToggleRow`.
   * It dims AND announces itself as unavailable, so the wait is visible to a
   * sighted user and to a screen-reader user alike, rather than the row simply
   * swallowing taps.
   */
  disabled?: boolean;
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
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={(state) => [rowStyle(t)(state), disabled && { opacity: 0.5 }]}
    >
      <Icon
        name={icon}
        size={24}
        color={tone === "danger" ? t.c.danger : t.c["text-secondary"]}
      />
      <RowText title={title} caption={caption} tone={tone} />
      {badge ? <Badge label={badge} /> : null}
      {chevron ? (
        <Icon name="chevron-right" size={20} color={t.c["text-muted"]} />
      ) : null}
    </Pressable>
  );
}

/**
 * A single-choice group of `RadioRow`s inside a `ListGroup` (§16 + §05): the
 * container is announced as ONE radio group, labelled by the section kicker
 * above it, so a screen-reader user hears «ВИГЛЯД, 1 з 3» rather than three
 * unrelated controls. Used for Settings → ВИГЛЯД (#162).
 */
export function RadioRowGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label}>
      <ListGroup>{children}</ListGroup>
    </View>
  );
}

/**
 * A settings choice row (§16 + the §05 radio card's selection cue): a leading
 * line icon, a title, an optional caption, and the trailing 22px radio. The
 * whole 52pt row is the `radio` — one accessible node carrying the label,
 * caption, and checked state, so the dot itself stays decorative and the entire
 * row is the target. Tapping an already-selected row is a no-op by design: a
 * radio group is left through another option, never emptied.
 */
export function RadioRow({
  icon,
  title,
  caption,
  selected,
  onSelect,
  testID,
}: {
  icon: IconName;
  title: string;
  caption?: string;
  selected: boolean;
  onSelect: () => void;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, selected }}
      accessibilityLabel={caption ? `${title}. ${caption}` : title}
      onPress={onSelect}
      style={rowStyle(t)}
    >
      <Icon name={icon} size={24} color={t.c["text-secondary"]} />
      <RowText title={title} caption={caption} />
      <RadioDot selected={selected} />
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
