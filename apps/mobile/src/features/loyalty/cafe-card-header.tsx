import type { CafeBalance } from "@kavtsya/shared";
import { Text, View } from "react-native";

import { fontFamily, useTheme } from "@/theme";

import { rewardLabel } from "./reward";

/**
 * A Café card's top line: the Café name with its Reward name always visible on
 * the right (1a row, 1h success). One component so the row and the redemption
 * success card render the header identically.
 */
export function CafeCardHeader({ cafe }: { cafe: CafeBalance }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 8,
      }}
    >
      <Text
        style={{
          flexShrink: 1,
          fontSize: 16,
          fontFamily: fontFamily.body.semibold,
          color: t.c.foreground,
        }}
      >
        {cafe.cafeName}
      </Text>
      {cafe.reward ? (
        <Text
          style={{
            fontSize: 12,
            fontFamily: fontFamily.body.semibold,
            color: t.c["text-secondary"],
          }}
        >
          {rewardLabel(cafe.reward)}
        </Text>
      ) : null}
    </View>
  );
}
