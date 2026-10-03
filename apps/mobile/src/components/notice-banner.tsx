import { useEffect, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  StatusStrip,
  statusSurface,
  type StatusIntent,
} from "@/components/status-strip";
import {
  useNoticeLifetime,
  type NoticeLifetime,
} from "@/lib/use-notice-lifetime";
import { useTheme } from "@/theme";

/**
 * A floating notice over a Mode surface (catalog §9b, #219). Not a new anatomy:
 * it is `StatusStrip` in a different placement — anchored under the safe area,
 * elevated over the Mode's own layout so it never pushes it around.
 *
 * The shell adds only what the placement needs:
 * - a `surface`-backed card with a `border-strong` outline, painted in the
 *   strip's own tint so the strip and its controls read as one card;
 * - a short fade/slide in on mount, and an `AccessibilityInfo` announcement of
 *   `announcement` — something changed under the reader that they cannot see;
 * - an optional ✕ and an optional `action` row (a retry, under the copy);
 * - a `lifetime`: `transient` leaves by itself, `persistent` stays until acted
 *   on (an error never auto-dismisses). Either way the exit animation runs
 *   before `onDismiss`, so the caller's state outlives what is still showing.
 *
 * Two notices that want the slot at once are the caller's call — there is no
 * queue here on purpose (#219: a host is deferred until a third caller).
 */
export function NoticeBanner({
  intent,
  title,
  detail,
  announcement,
  lifetime,
  onDismiss,
  action,
  testID,
}: {
  intent: StatusIntent;
  title: string;
  detail?: string;
  /** What a screen reader hears on mount, and again whenever it changes. */
  announcement: string;
  lifetime: NoticeLifetime;
  onDismiss: () => void;
  /** A control under the copy — typically a secondary «Спробувати знову». */
  action?: ReactNode;
  testID?: string;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  // Lazy init so the driver value is created once, not a ref read in render.
  const [anim] = useState(() => new Animated.Value(0));

  const dismiss = useNoticeLifetime({
    lifetime,
    onDismiss,
    exit: (done) =>
      Animated.timing(anim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start(() => done()),
  });

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [anim]);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(announcement);
  }, [announcement]);

  const tint = statusSurface(t, intent);

  return (
    <Animated.View
      testID={testID}
      accessibilityRole="alert"
      style={{
        position: "absolute",
        top: insets.top + t.space[2],
        left: t.space[4],
        right: t.space[4],
        zIndex: 20,
        // Opaque under the strip: an `info` strip has no tint of its own, and
        // the Mode must not show through a notice floating over it.
        backgroundColor: tint === "transparent" ? t.c.surface : tint,
        borderWidth: 1,
        borderColor: t.c["border-strong"],
        borderRadius: t.radius.md,
        overflow: "hidden",
        opacity: anim,
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [-8, 0],
            }),
          },
        ],
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <StatusStrip intent={intent} title={title} detail={detail} />
        </View>
        <Pressable
          testID={testID ? `${testID}.dismiss` : undefined}
          accessibilityRole="button"
          accessibilityLabel="Сховати"
          hitSlop={12}
          onPress={dismiss}
          style={{ paddingTop: t.space[3], paddingRight: t.space[4] }}
        >
          <Text
            style={{ fontSize: t.font.size.xl, color: t.c["text-secondary"] }}
          >
            ✕
          </Text>
        </Pressable>
      </View>
      {action ? (
        <View
          style={{
            paddingHorizontal: t.space[4],
            paddingBottom: t.space[3],
          }}
        >
          {action}
        </View>
      ) : null}
    </Animated.View>
  );
}
