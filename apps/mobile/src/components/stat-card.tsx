import { Text, View } from "react-native";

import { fontFamily, useTheme } from "@/theme";

/**
 * One figure in the analytics stat trio (shared-component catalog §13): a
 * `surface` card with a big tabular value over a muted label. The `accent`
 * variant — `primary-surface` fill + a `primary` border — highlights the single
 * loyalty metric («Повернулися»); the others stay plain so the accent reads.
 *
 * `loading` swaps the value for a dim skeleton bar while the period reloads. The
 * card never defines its own metric — the view pairs the trio with a one-line
 * glossary — so each card is announced as just «{value} {label}».
 */
export function StatCard({
  value,
  label,
  accent = false,
  loading = false,
  testID,
}: {
  value: number;
  label: string;
  accent?: boolean;
  loading?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole={loading ? undefined : "text"}
      accessibilityLabel={loading ? undefined : `${value} ${label}`}
      style={{
        flex: 1,
        gap: t.space[1],
        alignItems: "center",
        paddingVertical: t.space[4],
        paddingHorizontal: t.space[2],
        borderRadius: t.radius.md,
        backgroundColor: accent ? t.c["primary-surface"] : t.c.surface,
        borderWidth: accent ? 1.5 : 1,
        borderColor: accent ? t.c.primary : t.c.border,
      }}
    >
      {loading ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 24,
            height: 26,
            borderRadius: t.radius.sm,
            backgroundColor: t.c.foreground,
            opacity: 0.2,
          }}
        />
      ) : (
        <Text
          style={{
            fontSize: 26,
            lineHeight: 30,
            fontFamily: fontFamily.body.bold,
            fontVariant: ["tabular-nums"],
            color: t.c.foreground,
          }}
        >
          {value}
        </Text>
      )}
      <Text
        style={{
          fontSize: 12,
          fontFamily: fontFamily.body.medium,
          color: t.c["text-muted"],
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </View>
  );
}
