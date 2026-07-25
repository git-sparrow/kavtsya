import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { Icon } from "@/components/icon";
import { Surface } from "@/components/surface";
import { Heading } from "@/components/text";
import { fontFamily, useTheme } from "@/theme";

/**
 * The Pro-pitch / invite offer card (catalog §12): a reward-emphasis card — 1.5px
 * `primary` border + the gold glow — holding a serif promise, optional proof
 * (a paragraph on 5a, the chart preview on 6a), and a checklist of what the
 * offer buys. Checks are icon + text rows, never bullets or emoji.
 *
 * Shared by the two Pro pitches (5a Розсилка, 6a Аналітика) and the turn-8
 * transfer invite, so the anatomy lives here once instead of drifting per screen.
 */
export function OfferCard({
  promise,
  checks,
  children,
  testID,
}: {
  promise: string;
  checks: string[];
  children?: ReactNode;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Surface testID={testID} emphasis="reward">
      <Heading size={22} accessibilityRole="header">
        {promise}
      </Heading>
      {children}
      <View style={{ gap: t.space[3], marginTop: t.space[1] }}>
        {checks.map((check) => (
          <Benefit key={check}>{check}</Benefit>
        ))}
      </View>
    </Surface>
  );
}

/** One checklist line: a `success` check glyph + the promise it stands for. */
function Benefit({ children }: { children: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: t.space[3] }}>
      <Icon name="check" size={20} color={t.c.success} strokeWidth={2.4} />
      <Text
        style={{
          flex: 1,
          fontSize: t.font.size.base,
          lineHeight: t.font.size.base * t.font.lineHeight.snug,
          fontFamily: fontFamily.body.regular,
          color: t.c.foreground,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

/**
 * The offer card's companion price strip (catalog §12): «Pro — від ₴390/міс · 14
 * днів безкоштовно». The numbers ARE the v1 upgrade path (ADR 0011) — there is no
 * in-app payment, so the price has to be legible before the Telegram CTA.
 *
 * One wrapping sentence, price in bold and the trial quieter behind it — not two
 * flexed columns, which clipped the trial line at narrow widths.
 */
export function PriceStrip() {
  const t = useTheme();
  return (
    <View
      accessible
      accessibilityLabel="Pro — від 390 гривень на місяць. 14 днів безкоштовно."
      style={{
        backgroundColor: t.c["accent-surface"],
        borderRadius: t.radius.md,
        paddingVertical: t.space[4],
        paddingHorizontal: t.space[5],
      }}
    >
      <Text
        style={{
          fontSize: t.font.size.lg,
          lineHeight: t.font.size.lg * t.font.lineHeight.snug,
          fontFamily: fontFamily.body.bold,
          color: t.c.foreground,
        }}
      >
        Pro — від ₴390/міс{" "}
        <Text
          style={{
            fontSize: t.font.size.sm,
            fontFamily: fontFamily.body.semibold,
            color: t.c["text-secondary"],
          }}
        >
          · 14 днів безкоштовно
        </Text>
      </Text>
    </View>
  );
}
