import { Text, View } from "react-native";

import { Icon, type IconName } from "@/components/icon";
import { fontFamily, useTheme } from "@/theme";

/** The app's inline outcome/status banner — never a toast (catalog §9). */
export type StatusIntent = "success" | "danger" | "info";

/**
 * One anatomy, three intents: a `radius-md` strip with an icon + a bold title +
 * an optional detail line. Status is always icon + text, never colour alone, and
 * the strip is a live region so a screen-reader hears the outcome on mount
 * (danger is assertive; success/info polite).
 * - `success` — `success-surface`, check glyph + title in `success`.
 * - `danger` — `danger-surface`, alert glyph + title in `danger`, detail is the
 *   recovery instruction.
 * - `info` — no tint (nothing failed): info glyph in `text-muted`, copy in
 *   `text-secondary`.
 *
 * `solid` is the dedicated-confirmation form (3c program saved): a 1px accent
 * border and a solid accent circle badge with the glyph in the intent's
 * foreground colour, and the title in `text-body` (no coloured sentence). Use it
 * when the outcome IS the screen, not an inline note.
 */
export function StatusStrip({
  intent,
  title,
  detail,
  solid = false,
  testID,
}: {
  intent: StatusIntent;
  title: string;
  detail?: string;
  solid?: boolean;
  testID?: string;
}) {
  const t = useTheme();

  const spec: Record<
    StatusIntent,
    { bg: string; icon: IconName; accent: string; onAccent: string }
  > = {
    success: {
      bg: t.c["success-surface"],
      icon: "check",
      accent: t.c.success,
      onAccent: t.c["success-foreground"],
    },
    danger: {
      bg: t.c["danger-surface"],
      icon: "alert",
      accent: t.c.danger,
      onAccent: t.c["danger-foreground"],
    },
    // Informational: no tinted background, muted glyph.
    info: {
      bg: "transparent",
      icon: "info",
      accent: t.c["text-muted"],
      onAccent: t.c.foreground,
    },
  };
  const { bg, icon, accent, onAccent } = spec[intent];

  return (
    <View
      testID={testID}
      accessible
      accessibilityLiveRegion={intent === "danger" ? "assertive" : "polite"}
      style={{
        alignSelf: "stretch",
        flexDirection: "row",
        alignItems: solid ? "center" : "flex-start",
        gap: t.space[3],
        backgroundColor: bg,
        borderRadius: t.radius.md,
        borderWidth: solid ? 1 : 0,
        borderColor: accent,
        paddingVertical: t.space[3],
        paddingHorizontal: t.space[4],
      }}
    >
      {solid ? (
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: t.radius.full,
            backgroundColor: accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} size={20} color={onAccent} strokeWidth={2.6} />
        </View>
      ) : (
        <Icon
          name={icon}
          size={22}
          color={accent}
          strokeWidth={intent === "success" ? 2.4 : 1.8}
        />
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            fontSize: t.font.size.base,
            fontFamily: fontFamily.body.semibold,
            color: solid || intent === "info" ? t.c.foreground : accent,
          }}
        >
          {title}
        </Text>
        {detail ? (
          <Text
            style={{
              fontSize: 13.5,
              fontFamily: fontFamily.body.regular,
              color: t.c["text-secondary"],
            }}
          >
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The reward-ready chip «★ Винагорода готова» (catalog §9 reward form): a gold
 * `primary` pill with `primary-foreground` text, sat on a reward-emphasis card.
 * Decorative star; the label carries the meaning.
 */
export function RewardBadge({
  label = "Винагорода готова",
}: {
  label?: string;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: t.c.primary,
        borderRadius: t.radius.full,
        paddingHorizontal: 11,
        paddingVertical: 4,
      }}
    >
      <Text
        aria-hidden
        style={{ color: t.c["primary-foreground"], fontSize: t.font.size.xs }}
      >
        ★
      </Text>
      <Text
        style={{
          color: t.c["primary-foreground"],
          fontSize: t.font.size.xs,
          fontFamily: fontFamily.body.bold,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
