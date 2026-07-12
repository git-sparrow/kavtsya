import type { ReactNode } from "react";
import { View } from "react-native";

import { useTheme } from "@/theme";

/** A full-width, stretched column with consistent spacing between its rows. */
export function Card({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={{ alignItems: "stretch", alignSelf: "stretch", gap: t.space[3] }}
    >
      {children}
    </View>
  );
}
