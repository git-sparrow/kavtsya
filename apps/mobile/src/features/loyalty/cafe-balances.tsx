import type { CafeBalance } from "@kavtsya/shared";
import { isRedemptionReady } from "@kavtsya/shared";
import { useState } from "react";
import { Text, View } from "react-native";

import { BeanRow } from "@/components/bean-row";
import { Berehynia } from "@/components/berehynia";
import { Button } from "@/components/button";
import { RewardBadge, StatusStrip } from "@/components/status-strip";
import { Surface } from "@/components/surface";
import { Heading } from "@/components/text";
import { pluralizeUk } from "@/lib/plural";
import { fontFamily, useTheme } from "@/theme";

import { RedemptionSheet } from "./redemption-sheet";
import { rewardLabel } from "./reward";
import { useBalances } from "./use-balances";

/** «зернятко» in its three count forms: 1 зернятко / 3 зернятка / 7 зернят. */
const BEAN_FORMS = { one: "зернятко", few: "зернятка", many: "зернят" };

/**
 * The Cafés where the Customer holds Зернятка (#20): balance against the Café's
 * threshold plus its Reward, each its own card with the progress shown as beans.
 * Each Café is an independent program (ADR 0001), so there is deliberately no
 * combined total. Empty (1e/1o) is the Берегиня first-Зернятко invitation; a
 * fetch error is a danger strip with retry (pattern 1d).
 */
export function CafeBalances() {
  const t = useTheme();
  const { balances, error, reload } = useBalances();
  // The Café whose Redemption sheet is open, if any (1g).
  const [redeeming, setRedeeming] = useState<CafeBalance | null>(null);

  if (error) {
    return (
      <View style={{ alignSelf: "stretch", gap: t.space[3] }}>
        <StatusStrip
          intent="danger"
          title="Не вдалося завантажити зернятка"
          detail={error}
        />
        <Button
          title="Спробувати знову"
          variant="secondary"
          onPress={() => void reload()}
        />
      </View>
    );
  }

  // First load still in flight — the QR above is the screen's main content, so
  // no spinner; the list simply appears.
  if (!balances) return null;

  if (balances.length === 0) {
    return (
      <View
        style={{
          alignItems: "center",
          gap: t.space[3],
          paddingVertical: t.space[4],
        }}
      >
        <Berehynia size={40} />
        <Heading size={20}>Перше зернятко чекає</Heading>
        <Text
          style={{
            maxWidth: 240,
            textAlign: "center",
            fontSize: 13.5,
            lineHeight: 20,
            fontFamily: fontFamily.body.regular,
            color: t.c["text-secondary"],
          }}
        >
          Купи каву й покажи свій QR — кав&apos;ярня з&apos;явиться тут разом із
          першим зернятком
        </Text>
      </View>
    );
  }

  return (
    <View style={{ alignSelf: "stretch", gap: t.space[3] }}>
      {balances.map((b) =>
        isRedemptionReady(b) ? (
          <RewardReadyCard
            key={b.cafeId}
            cafe={b}
            onRedeem={() => setRedeeming(b)}
          />
        ) : (
          <CafeRow key={b.cafeId} cafe={b} />
        ),
      )}
      <RedemptionSheet
        cafe={redeeming}
        onClose={() => {
          setRedeeming(null);
          void reload();
        }}
      />
    </View>
  );
}

/** A Café still collecting toward its Reward (1a row). */
function CafeRow({ cafe }: { cafe: CafeBalance }) {
  const t = useTheme();
  const remaining = cafe.threshold - cafe.balance;
  return (
    <View
      style={{
        backgroundColor: t.c.surface,
        borderWidth: 1,
        borderColor: t.c.border,
        borderRadius: t.radius.md,
        paddingVertical: 14,
        paddingHorizontal: 16,
        gap: 6,
      }}
    >
      <CafeRowHeader cafe={cafe} />
      <Text
        style={{
          fontSize: 13,
          fontFamily: fontFamily.body.regular,
          color: t.c["text-muted"],
        }}
      >
        {cafe.balance} {pluralizeUk(cafe.balance, BEAN_FORMS)} · ще {remaining}{" "}
        до Винагороди
      </Text>
      <BeanRow balance={cafe.balance} threshold={cafe.threshold} />
    </View>
  );
}

/** The elevated reward-ready card (1f/1p): gold border + glow, badge, CTA. */
function RewardReadyCard({
  cafe,
  onRedeem,
}: {
  cafe: CafeBalance;
  onRedeem: () => void;
}) {
  const t = useTheme();
  return (
    <Surface emphasis="reward" style={{ paddingVertical: 16, gap: 10 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
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
        <RewardBadge />
      </View>
      <Text
        style={{
          fontSize: 13,
          fontFamily: fontFamily.body.regular,
          color: t.c["text-secondary"],
        }}
      >
        {rewardLabel(cafe.reward)} · {cafe.threshold}{" "}
        {pluralizeUk(cafe.threshold, BEAN_FORMS)} зібрано
      </Text>
      <BeanRow balance={cafe.balance} threshold={cafe.threshold} />
      <Button title="Як отримати" onPress={onRedeem} />
    </Surface>
  );
}

/** Café name + always-visible Reward name — shared by the row and success card. */
function CafeRowHeader({ cafe }: { cafe: CafeBalance }) {
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
