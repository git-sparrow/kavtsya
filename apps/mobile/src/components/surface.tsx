import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";

import { useTheme } from "@/theme";

/**
 * A raised white content card — the design system's `surface` colour over the
 * warm background, with the `card` shadow token. The mockups frame the QR and
 * the Café list in one of these; screens compose them instead of styling ad-hoc
 * boxes.
 */
export function Surface({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          alignSelf: "stretch",
          backgroundColor: t.c.surface,
          borderRadius: t.radius.lg,
          padding: t.space[5],
          gap: t.space[3],
          // The `shadow.card` token (color #50371e26 = #50371e @ 0.15, offsetY
          // 8, blur 22), expressed for React Native (iOS shadow* + Android
          // elevation).
          shadowColor: "#50371e",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.15,
          shadowRadius: 16,
          elevation: 4,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
