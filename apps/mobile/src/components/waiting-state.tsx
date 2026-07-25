import { View } from "react-native";

import { Button } from "@/components/button";
import { Icon, type IconName } from "@/components/icon";
import { Heading, Muted } from "@/components/text";
import { fontFamily, useTheme } from "@/theme";

/** An action rendered under a waiting hero — the primary «Добре» or a quiet undo. */
export interface WaitingAction {
  label: string;
  onPress: () => void;
  testID?: string;
}

/**
 * The shared **waiting-state** anatomy (redesign turn 5f, «Запит надіслано»):
 * a soft `primary-surface` disc holding a line icon, a serif title, a
 * what-happens-next line, then the actions pinned to the bottom. It is the
 * calm terminal for "we're waiting on someone else" — reused by 7c (invite
 * sent), 8b (transfer accepted), 9c (export sent). Status is icon + text, never
 * a spinner: nothing is loading on THIS device, so a spinner would lie about
 * where the wait lives.
 *
 * Drops into a header-less area and fills it: flex spacers centre the hero and
 * float the actions to the foot, matching the mockup. The hero is one polite
 * live region so a screen-reader announces the outcome on mount, then the
 * actions read as ordinary buttons. The disc + icon are decorative (the title
 * carries the meaning), so they stay hidden from assistive tech.
 */
export function WaitingState({
  icon = "clock",
  title,
  body,
  primaryAction,
  secondaryAction,
  testID,
}: {
  icon?: IconName;
  title: string;
  body: string;
  primaryAction: WaitingAction;
  secondaryAction?: WaitingAction;
  testID?: string;
}) {
  const t = useTheme();
  const isDark = t.themeName === "dark";
  return (
    <View
      testID={testID}
      style={{ flex: 1, alignSelf: "stretch", gap: t.space[4] }}
    >
      <View style={{ flex: 1 }} />
      <View
        accessible
        accessibilityLiveRegion="polite"
        style={{ alignItems: "center", gap: t.space[5] }}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 96,
            height: 96,
            borderRadius: t.radius.full,
            backgroundColor: t.c["primary-surface"],
            alignItems: "center",
            justifyContent: "center",
            // primary-surface collapses onto surface in dark — ring it so the
            // disc reads (the standing dark rule, as on Avatar).
            ...(isDark ? { borderWidth: 1, borderColor: t.c.primary } : null),
          }}
        >
          <Icon name={icon} size={40} color={t.c.primary} strokeWidth={1.8} />
        </View>
        <View style={{ gap: t.space[2], alignItems: "center" }}>
          <Heading
            size={26}
            accessibilityRole="header"
            style={{ textAlign: "center" }}
          >
            {title}
          </Heading>
          <Muted
            style={{
              fontSize: t.font.size.base,
              lineHeight: t.font.size.base * t.font.lineHeight.snug,
              fontFamily: fontFamily.body.regular,
              color: t.c["text-secondary"],
            }}
          >
            {body}
          </Muted>
        </View>
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ gap: t.space[1] }}>
        <Button
          title={primaryAction.label}
          onPress={primaryAction.onPress}
          testID={primaryAction.testID}
        />
        {secondaryAction ? (
          <Button
            title={secondaryAction.label}
            variant="quiet"
            onPress={secondaryAction.onPress}
            testID={secondaryAction.testID}
          />
        ) : null}
      </View>
    </View>
  );
}
