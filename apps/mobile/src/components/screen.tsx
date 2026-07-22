import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { fontFamily, useTheme } from "@/theme";

/**
 * The app's outer chrome: brand wordmark over a vertically-centred, scrollable
 * content area on the warm background. Every screen renders inside one so the
 * layout and safe-area handling live in exactly one place.
 *
 * `settings` opts a screen into the top-left gear that opens Settings — the one
 * consistent way every role reaches account actions (ADR 0015). It is placed
 * only on the Mode landings (Customer, CafeOwner), never on Scanner Mode (the
 * kiosk: leaving requires ending the shift) nor on sign-in. A single glyph for
 * now — a custom icon set can replace it later without touching call sites.
 *
 * `header` replaces the centred brand wordmark with a screen-supplied top row
 * (the redesign drops the logo from the Mode landings — logo lives on sign-in +
 * splash only) and top-aligns the content for a real scroll. When it is set,
 * the legacy `settings` gear is suppressed: the header carries its own controls.
 */
export function Screen({
  children,
  settings = false,
  header,
}: {
  children: ReactNode;
  settings?: boolean;
  header?: ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const hasHeader = header !== undefined;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.c.background }}>
      {settings && !hasHeader && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Налаштування"
          hitSlop={16}
          onPress={() => router.push("/settings")}
          style={{
            position: "absolute",
            // Below the status bar / Dynamic Island, or taps land in the
            // system dead zone instead of the app.
            top: insets.top + t.space[1],
            left: t.space[4],
            zIndex: 10,
            padding: t.space[2],
          }}
        >
          <Text style={{ fontSize: 26, color: t.c["text-secondary"] }}>⚙</Text>
        </Pressable>
      )}
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: hasHeader ? "stretch" : "center",
          justifyContent: hasHeader ? "flex-start" : "center",
          gap: t.space[4],
          padding: t.space[6],
        }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {hasHeader ? (
          header
        ) : (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: t.space[3],
            }}
          >
            <Text style={{ fontSize: t.font.size.xl, color: t.c.accent }}>
              ✦
            </Text>
            <Text
              style={{
                fontSize: t.font.size.display,
                fontFamily: fontFamily.display.bold,
                color: t.c.foreground,
              }}
            >
              Кавця
            </Text>
            <Text style={{ fontSize: t.font.size.xl, color: t.c.accent }}>
              ✦
            </Text>
          </View>
        )}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
