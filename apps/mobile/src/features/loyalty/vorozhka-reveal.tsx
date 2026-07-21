import type { PendingFortune } from "@kavtsya/shared";
import { isRedemptionReady } from "@kavtsya/shared";
import type { ComponentType } from "react";
import { Modal, ScrollView, Text, View } from "react-native";
import SvgBase, {
  Circle as CircleBase,
  Defs as DefsBase,
  RadialGradient as RadialGradientBase,
  Stop as StopBase,
  type CircleProps,
  type SvgProps,
} from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BeanRow } from "@/components/bean-row";
import { Berehynia } from "@/components/berehynia";
import { Button } from "@/components/button";
import { Heading } from "@/components/text";
import { VorozhkaCup } from "@/components/vorozhka-cup";
import { ThemeProvider, fontFamily, useTheme } from "@/theme";

import { rewardLabel } from "./reward";

// React 19 strict-JSX coercion for react-native-svg's class exports (see icon.tsx).
const Svg = SvgBase as unknown as ComponentType<SvgProps>;
const Circle = CircleBase as unknown as ComponentType<CircleProps>;
const Defs = DefsBase as unknown as ComponentType<{
  children: React.ReactNode;
}>;
const RadialGradient = RadialGradientBase as unknown as ComponentType<
  Record<string, unknown>
>;
const Stop = StopBase as unknown as ComponentType<Record<string, unknown>>;

/**
 * The Ворожка reveal (1k/1l, #23, redesign turn 1). The ritual on the Customer's
 * device: it appears (via `usePendingFortune`) shortly after the CafeOwner scans.
 * Always dark regardless of the OS theme (decision: option A) — it wraps itself
 * in the dark theme. The fortune text appears instantly (no typewriter); the cup
 * grounds swirl (reduce-motion → the Modal's fade instead). When the scan left
 * the Customer reward-ready it becomes the 1l variant, offering redemption.
 */
export function VorozhkaReveal({
  fortune,
  onDismiss,
}: {
  fortune: PendingFortune;
  onDismiss: () => void;
}) {
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <ThemeProvider theme="dark">
        <RevealBody fortune={fortune} onDismiss={onDismiss} />
      </ThemeProvider>
    </Modal>
  );
}

function RevealBody({
  fortune,
  onDismiss,
}: {
  fortune: PendingFortune;
  onDismiss: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const ready = isRedemptionReady(fortune);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.background }}>
      <View
        pointerEvents="none"
        style={{ position: "absolute", top: 110, alignSelf: "center" }}
      >
        <Svg width={320} height={320}>
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
              <Stop
                offset="0%"
                stopColor={t.color.primary[400]}
                stopOpacity={0.26}
              />
              <Stop
                offset="62%"
                stopColor={t.color.primary[400]}
                stopOpacity={0}
              />
            </RadialGradient>
          </Defs>
          <Circle cx={160} cy={160} r={160} fill="url(#glow)" />
        </Svg>
      </View>

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingTop: insets.top + 40,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          <Berehynia size={15} />
          <Text
            accessibilityRole="header"
            style={{
              fontFamily: fontFamily.body.bold,
              fontSize: 16,
              letterSpacing: 3.5,
              color: t.c.primary,
            }}
          >
            ВОРОЖКА
          </Text>
          <Berehynia size={15} />
        </View>
        <Text
          style={{
            fontSize: 12.5,
            fontFamily: fontFamily.body.regular,
            color: t.c["text-muted"],
            marginTop: 2,
            marginBottom: 18,
          }}
        >
          {fortune.cafeName}
        </Text>

        <VorozhkaCup size={130} />

        <FortuneText text={fortune.fortune} />

        <ProgressCard fortune={fortune} ready={ready} />

        <View style={{ alignSelf: "stretch", marginTop: 20 }}>
          {ready ? (
            <>
              <Button title="Отримати Винагороду" onPress={onDismiss} />
              <Button title="Пізніше" variant="quiet" onPress={onDismiss} />
            </>
          ) : (
            <Button title="Дякую" onPress={onDismiss} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** The fortune in serif guillemets, its lead phrase in `primary` (1k). */
function FortuneText({ text }: { text: string }) {
  const t = useTheme();
  // Lead = up to the first comma / em-dash / period; the rest stays in body ink.
  const match = text.match(/^([^,—.]*)(.*)$/s);
  const lead = match ? match[1] : text;
  const rest = match ? match[2] : "";
  return (
    <Text
      style={{
        fontFamily: fontFamily.display.semibold,
        fontSize: 24,
        lineHeight: 24 * 1.38,
        color: t.c.foreground,
        textAlign: "center",
        maxWidth: 260,
        marginTop: 20,
      }}
    >
      «<Text style={{ color: t.c.primary }}>{lead}</Text>
      {rest}»
    </Text>
  );
}

/** The quiet progress card (1k) / reward-ready card (1l) beneath the fortune. */
function ProgressCard({
  fortune,
  ready,
}: {
  fortune: PendingFortune;
  ready: boolean;
}) {
  const t = useTheme();
  const remaining = Math.max(0, fortune.threshold - fortune.balance);
  return (
    <View
      style={{
        alignSelf: "stretch",
        alignItems: "center",
        gap: 9,
        marginTop: 24,
        backgroundColor: ready ? t.c["primary-surface"] : t.c.surface,
        borderWidth: ready ? 1.5 : 1,
        borderColor: ready ? t.c.primary : t.c.border,
        borderRadius: t.radius.md,
        paddingVertical: 12,
        paddingHorizontal: 14,
      }}
    >
      {ready ? (
        <>
          <Text
            style={{
              fontFamily: fontFamily.body.bold,
              fontSize: 12,
              letterSpacing: 1,
              color: t.c.link,
            }}
          >
            ★ ВИНАГОРОДА ГОТОВА
          </Text>
          <BeanRow balance={fortune.balance} threshold={fortune.threshold} />
          <Heading size={18}>
            {rewardLabel(fortune.reward) || "Винагорода"}
          </Heading>
        </>
      ) : (
        <>
          <BeanRow balance={fortune.balance} threshold={fortune.threshold} />
          <Text style={{ fontSize: 12.5, color: t.c["text-secondary"] }}>
            <Text
              style={{
                fontFamily: fontFamily.body.bold,
                color: t.c.primary,
              }}
            >
              +1 Зернятко
            </Text>
            <Text style={{ fontFamily: fontFamily.body.regular }}>
              {" "}
              · ще {remaining} до Винагороди
            </Text>
          </Text>
        </>
      )}
    </View>
  );
}
