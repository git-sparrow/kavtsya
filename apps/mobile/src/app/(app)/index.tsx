import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Icon } from "@/components/icon";
import { Screen } from "@/components/screen";
import { ErrorText, Muted } from "@/components/text";
import { useMe } from "@/features/account/me-context";
import { CustomerMode } from "@/features/mode/customer-mode";
import { useMode } from "@/features/mode/mode-context";
import { OwnerMode } from "@/features/mode/owner-mode";
import { ScannerMode } from "@/features/mode/scanner-mode";
import { authClient } from "@/lib/auth-client";
import { useScreenAction } from "@/lib/use-screen-action";
import { fontFamily, useTheme } from "@/theme";

/** How long the notice stays before it fades itself out (#99). */
const SHIFT_ENDED_AUTO_DISMISS_MS = 5000;

/**
 * What a failed shift check actually costs, in the second line of its banner
 * (#187).
 *
 * Phrased as a condition because the app cannot scope the banner to the people
 * it is for: roster membership is not a role, so `/api/me` says «customer» for a
 * barista and a customer alike, and the failed read is exactly the answer that
 * would have told them apart. «Якщо ви на зміні» is how a Customer reads past a
 * Mode's vocabulary that was never theirs (ADR 0015), while the barista who
 * needs it still gets told what is missing.
 */
const SHIFT_CHECK_FAILED_DETAIL = "Якщо ви на зміні, сканер поки недоступний.";

/**
 * A brief top banner when a shift just ended (#99): the app has already
 * re-derived to the barista's default Mode; this only tells them why the kiosk
 * is gone (owner ended it, removed them, or the cap lapsed). Absolutely
 * positioned so it never disturbs the Mode's own layout.
 *
 * It fades/slides in on mount and announces itself to screen readers — the
 * Mode changed under the barista, so a non-visual user must hear why. It then
 * fades itself out after a few seconds (auto-dismiss), and the ✕ triggers the
 * same exit early; either way the exit animation runs before `onDismiss` clears
 * the notice upstream and unmounts us.
 */
function ShiftEndedBanner({
  cafeName,
  onDismiss,
}: {
  cafeName: string;
  onDismiss: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  // Lazy init so the driver value is created once, not a ref read in render.
  const [anim] = useState(() => new Animated.Value(0));
  // Guards the auto-dismiss timer and the ✕ from both firing an exit.
  const dismissing = useRef(false);

  const dismiss = useCallback(() => {
    if (dismissing.current) return;
    dismissing.current = true;
    Animated.timing(anim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => onDismiss());
  }, [anim, onDismiss]);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      `Зміну в «${cafeName}» завершено.`,
    );
    Animated.timing(anim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(dismiss, SHIFT_ENDED_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [anim, cafeName, dismiss]);

  return (
    <Animated.View
      accessibilityRole="alert"
      style={{
        position: "absolute",
        top: insets.top + t.space[2],
        left: t.space[4],
        right: t.space[4],
        zIndex: 20,
        flexDirection: "row",
        alignItems: "center",
        gap: t.space[3],
        backgroundColor: t.c.surface,
        borderWidth: 1,
        borderColor: t.c["border-strong"],
        borderRadius: t.radius.md,
        paddingVertical: t.space[3],
        paddingHorizontal: t.space[4],
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
      <Text
        style={{
          flex: 1,
          color: t.c.foreground,
          fontFamily: fontFamily.body.regular,
          fontSize: t.font.size.sm,
        }}
      >
        Зміну в «{cafeName}» завершено.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Сховати"
        hitSlop={12}
        onPress={dismiss}
      >
        <Text
          style={{ fontSize: t.font.size.xl, color: t.c["text-secondary"] }}
        >
          ✕
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * What a failed shift check costs, said out loud (#187).
 *
 * When `GET /api/me/shift` fails, the app derives the default Mode rather than
 * spinning forever — but "no answer" and "off duty" then look identical on
 * screen, and a barista whose check failed would sit in Customer Mode wondering
 * where their scanner went. This is the difference made visible: the message the
 * read produced, what it costs, and the retry.
 *
 * Positioned like its sibling above, so it never disturbs the Mode's own
 * layout, and announced on mount — the Mode a non-visual user landed in is not
 * the one the server would have given them, which they cannot see.
 */
function ShiftCheckFailedBanner({
  message,
  busy,
  onRetry,
  onDismiss,
}: {
  message: string;
  busy: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      `${message} ${SHIFT_CHECK_FAILED_DETAIL}`,
    );
  }, [message]);

  return (
    <View
      testID="home.shift-check-failed"
      accessibilityRole="alert"
      style={{
        position: "absolute",
        top: insets.top + t.space[2],
        left: t.space[4],
        right: t.space[4],
        zIndex: 20,
        backgroundColor: t.c.surface,
        borderWidth: 1,
        borderColor: t.c["border-strong"],
        borderRadius: t.radius.md,
        paddingVertical: t.space[3],
        paddingHorizontal: t.space[4],
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: t.space[3],
        }}
      >
        {/* Never colour alone: the glyph carries the same "something failed"
            the danger red does, for anyone who cannot see the red. */}
        <Icon name="alert" size={22} color={t.c.danger} strokeWidth={1.8} />
        <View style={{ flex: 1, gap: 2 }}>
          <ErrorText style={{ textAlign: "left" }}>{message}</ErrorText>
          <Muted style={{ textAlign: "left" }}>
            {SHIFT_CHECK_FAILED_DETAIL}
          </Muted>
        </View>
        <Pressable
          testID="home.shift-check-failed.dismiss"
          accessibilityRole="button"
          accessibilityLabel="Сховати"
          hitSlop={12}
          onPress={onDismiss}
        >
          <Text
            style={{ fontSize: t.font.size.xl, color: t.c["text-secondary"] }}
          >
            ✕
          </Text>
        </Pressable>
      </View>
      <Button
        title="Спробувати знову"
        variant="secondary"
        testID="home.shift-check-failed.retry"
        busy={busy}
        onPress={onRetry}
      />
    </View>
  );
}

/**
 * The Mode dispatcher (#96, ADR 0015). The app opens here and renders exactly
 * one of the three surfaces, chosen fresh from live account facts — active
 * Shift → Scanner; else CafeOwner → CafeOwner; else Customer. Nothing is
 * persisted: the landing re-derives on every focus (a returning excursion, a
 * finished sub-screen, a foreground), so the visible Mode never lags server
 * truth.
 */
export default function Home() {
  const t = useTheme();
  const { me, error, reload } = useMe();
  const {
    mode,
    loading,
    shift,
    shiftError,
    reloadShift,
    endedNotice,
    dismissEndedNotice,
  } = useMode();
  // The shift check gets the same treatment every other read in the app gets:
  // one line, dismissible per message, so waving it away once doesn't hide the
  // next failure — and the focus refetch below can't re-raise the one they just
  // dismissed either.
  const shiftCheck = useScreenAction({ error: shiftError });

  useFocusEffect(
    useCallback(() => {
      void reload();
      void reloadShift();
    }, [reload, reloadShift]),
  );

  if (error) {
    return (
      <Screen>
        <Card>
          <ErrorText>{error}</ErrorText>
          <Button
            title="Спробувати знову"
            variant="secondary"
            onPress={() => void reload()}
          />
          <Button
            title="Вийти"
            variant="secondary"
            onPress={() => authClient.signOut()}
          />
        </Card>
      </Screen>
    );
  }

  if (loading || !me) {
    return (
      <Screen>
        <ActivityIndicator size="large" color={t.c.foreground} />
      </Screen>
    );
  }

  const surface =
    mode === "scanner" ? (
      <ScannerMode />
    ) : mode === "owner" ? (
      <OwnerMode />
    ) : (
      <CustomerMode />
    );

  return (
    <>
      {surface}
      {/* The notice belongs to the default Mode the barista dropped back to —
          never over the kiosk (a fresh shift means nothing to announce). */}
      {endedNotice && mode !== "scanner" && (
        <ShiftEndedBanner
          cafeName={endedNotice}
          onDismiss={dismissEndedNotice}
        />
      )}
      {/* Only when the failure actually cost something: a refresh that fails
          over a shift already on screen keeps showing real data (the hook holds
          the last answer), so there is nothing to warn about — it is a failure
          with no shift to fall back on that makes "off duty" a guess. Both
          banners want the same strip, and the ended notice is the more specific
          news; it clears itself in a few seconds, after which this one takes the
          space if it is still true. */}
      {shiftCheck.error && shift == null && !endedNotice && (
        <ShiftCheckFailedBanner
          message={shiftCheck.error}
          busy={shiftCheck.busy}
          onRetry={() =>
            void shiftCheck.run(reloadShift, "Не вдалося перевірити зміну")
          }
          onDismiss={shiftCheck.clear}
        />
      )}
    </>
  );
}
