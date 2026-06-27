import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

/** A full-width, stretched column with consistent spacing between its rows. */
export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    alignItems: "stretch",
    alignSelf: "stretch",
    gap: 12,
  },
});
