import { useEffect, useRef, useState, type ReactNode } from "react";
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
  statusBackground,
  type StatusIntent,
} from "@/components/status-strip";
import { useNoticeLifetime } from "@/lib/use-notice-lifetime";
import { useTheme } from "@/theme";

/**
 * A floating notice over a Mode surface (catalog §9b, #219). Not a new anatomy:
 * it is `StatusStrip` in a different placement — anchored under the safe area,
 * elevated over the Mode's own layout so it never pushes it around.
 *
 * The shell adds only what the placement needs:
 * - a `surface`-backed card with a `border-strong` outline, painted in the
 *   strip's own tint so the strip and its controls read as one card;
 * - a short fade/slide in on mount (skipped under Reduce Motion), and an
 *   announcement of its title + detail — something changed under the reader
 *   that they cannot see;
 * - a ✕ and an optional `action` row (a retry, under the copy);
 * - a lifetime that follows from the intent: `danger` stays until acted on (an
 *   error never auto-dismisses), anything else leaves by itself. Either way the
 *   exit runs before `onDismiss`, so the caller's state outlives what is still
 *   showing.
 *
 * Two notices that want the slot at once are the caller's call — there is no
 * queue here on purpose (#219: a host is deferred until a third caller).
 *
 * A notice is its message: when the title or detail changes, the card remounts.
 * The new message is news — it enters and is announced afresh — and a ✕ exit
 * still running for the old one cannot dismiss it on finishing (PR #279).
 */
export function NoticeBanner(props: NoticeProps) {
  return (
    <NoticeCard key={`${props.title}\n${props.detail ?? ""}`} {...props} />
  );
}

type NoticeProps = {
  intent: StatusIntent;
  title: string;
  detail?: string;
  onDismiss: () => void;
  /** A control under the copy — typically a secondary «Спробувати знову». */
  action?: ReactNode;
  testID?: string;
};

function NoticeCard({
  intent,
  title,
  detail,
  onDismiss,
  action,
  testID,
}: NoticeProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  // Lazy init so the driver value is created once, not a ref read in render.
  const [anim] = useState(() => new Animated.Value(0));
  // Read once on mount; the exit honours the same answer the entrance did.
  const reduceMotion = useRef(false);

  const dismiss = useNoticeLifetime({
    lifetime: intent === "danger" ? "persistent" : "transient",
    onDismiss,
    exit: (done) => {
      if (reduceMotion.current) return done();
      Animated.timing(anim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start(() => done());
    },
  });

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!mounted) return;
      reduceMotion.current = reduced;
      if (reduced) {
        anim.setValue(1);
      } else {
        Animated.timing(anim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }).start();
      }
    });
    return () => {
      mounted = false;
    };
  }, [anim]);

  const announcement = detail ? `${title} ${detail}` : title;
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(announcement);
  }, [announcement]);

  const tint = statusBackground(t, intent);

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
