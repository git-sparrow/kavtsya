import type { ReactNode } from "react";
import { ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { fontFamily, useTheme } from "@/theme";

/**
 * The app's outer chrome: brand wordmark over a vertically-centred, scrollable
 * content area on the warm background. Every screen renders inside one so the
 * layout and safe-area handling live in exactly one place.
 */
export function Screen({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.c.background }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: t.space[4],
          padding: t.space[6],
        }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <Text
          style={{
            fontSize: t.font.size.display,
            fontFamily: fontFamily.display.bold,
            color: t.c.foreground,
          }}
        >
          Кавця
        </Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
