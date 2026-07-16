import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { ErrorText } from "@/components/text";
import { useMe } from "@/features/account/me-context";
import { CustomerMode } from "@/features/mode/customer-mode";
import { useMode } from "@/features/mode/mode-context";
import { OwnerMode } from "@/features/mode/owner-mode";
import { ScannerMode } from "@/features/mode/scanner-mode";
import { authClient } from "@/lib/auth-client";
import { fontFamily, useTheme } from "@/theme";

/**
 * A brief top banner when a shift just ended (#99): the app has already
 * re-derived to the barista's default Mode; this only tells them why the kiosk
 * is gone (owner ended it, removed them, or the cap lapsed). Absolutely
 * positioned so it never disturbs the Mode's own layout; dismissible.
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
  return (
    <View
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
        onPress={onDismiss}
      >
        <Text
          style={{ fontSize: t.font.size.xl, color: t.c["text-secondary"] }}
        >
          ✕
        </Text>
      </Pressable>
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
  const { mode, loading, reloadShift, endedNotice, dismissEndedNotice } =
    useMode();

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
    </>
  );
}
