import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fontFamily, useTheme } from "@/theme";

import { EdgeFade } from "./edge-fade";

/**
 * The app's outer chrome: brand wordmark over a vertically-centred, scrollable
 * content area on the warm background. Every screen renders inside one so the
 * layout and safe-area handling live in exactly one place.
 *
 * The scroll runs edge to edge (#165): the safe-area insets are padding on the
 * scroll *content*, not an opaque band around the viewport, so content passes
 * behind the status bar and home indicator under an `EdgeFade` strip instead of
 * being clipped against them. At rest that lands content exactly where the old
 * `SafeAreaView` did.
 *
 * `header` replaces the centred brand wordmark with a screen-supplied top row
 * (the redesign drops the logo from the Mode landings — logo lives on sign-in +
 * splash only) and top-aligns the content for a real scroll.
 */
export function Screen({
  children,
  header,
}: {
  children: ReactNode;
  header?: ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const hasHeader = header !== undefined;
  return (
    <View style={{ flex: 1, backgroundColor: t.c.background }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: hasHeader ? "stretch" : "center",
          justifyContent: hasHeader ? "flex-start" : "center",
          gap: t.space[4],
          paddingHorizontal: t.space[6],
          paddingTop: insets.top + t.space[6],
          paddingBottom: insets.bottom + t.space[6],
        }}
        // `automatic` would re-add the safe area on top of the padding above and
        // push every screen down twice.
        contentInsetAdjustmentBehavior="never"
        scrollIndicatorInsets={{ top: insets.top, bottom: insets.bottom }}
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
      <EdgeFade edge="top" />
      <EdgeFade edge="bottom" />
    </View>
  );
}
