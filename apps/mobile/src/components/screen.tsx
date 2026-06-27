import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "@/theme/colors";

/**
 * The app's outer chrome: brand wordmark over a vertically-centred, scrollable
 * content area on the warm background. Every screen renders inside one so the
 * layout and safe-area handling live in exactly one place.
 */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.brand}>Кавця</Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },
  brand: {
    fontSize: 40,
    fontWeight: "700",
    color: colors.brand,
  },
});
