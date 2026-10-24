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
 * The status-bar inset stays outside the scroll viewport so content cannot
 * obscure its icons. The bottom inset scrolls beneath an `EdgeFade` strip.
 *
 * `header` replaces the centred brand wordmark with a screen-supplied top row
 * (the redesign drops the logo from the Mode landings — logo lives on sign-in +
 * splash only) and top-aligns the content. `fixedHeader` keeps navigation
 * controls outside the scroll viewport; Mode headers still scroll by default.
 */
export function Screen({
  children,
  header,
  fixedHeader = false,
}: {
  children: ReactNode;
  header?: ReactNode;
  fixedHeader?: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const hasHeader = header !== undefined;
  const headerIsFixed = hasHeader && fixedHeader;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.c.background,
        paddingTop: insets.top,
      }}
    >
      {headerIsFixed && (
        <View
          style={{
            paddingTop: t.space[6],
            paddingHorizontal: t.space[6],
          }}
        >
          {header}
        </View>
      )}
      <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: hasHeader ? "stretch" : "center",
            justifyContent: hasHeader ? "flex-start" : "center",
            gap: t.space[4],
            paddingHorizontal: t.space[6],
            paddingTop: headerIsFixed ? t.space[4] : t.space[6],
            paddingBottom: insets.bottom + t.space[6],
          }}
          // `automatic` would re-add the safe area on top of the padding above and
          // push every screen down twice.
          contentInsetAdjustmentBehavior="never"
          scrollIndicatorInsets={{ bottom: insets.bottom }}
          keyboardShouldPersistTaps="handled"
        >
          {headerIsFixed ? null : hasHeader ? (
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
        <EdgeFade edge="top" inset={0} />
        <EdgeFade edge="bottom" />
      </View>
    </View>
  );
}
