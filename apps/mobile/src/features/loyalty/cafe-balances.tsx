import type { CafeBalance } from "@kavtsya/shared";
import { isRedemptionReady } from "@kavtsya/shared";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { BeanRow } from "@/components/bean-row";
import { Berehynia } from "@/components/berehynia";
import { Button } from "@/components/button";
import { RewardBadge, StatusStrip } from "@/components/status-strip";
import { Surface } from "@/components/surface";
import { Heading } from "@/components/text";
import { BEAN_FORMS, pluralizeUk } from "@/lib/plural";
import { fontFamily, useTheme } from "@/theme";

import { CafeCardHeader } from "./cafe-card-header";
import { RedemptionSheet } from "./redemption-sheet";
import { rewardLabel } from "./reward";
import { useBalances } from "./use-balances";

/**
 * The Cafés where the Customer holds Зернятка (#20): balance against the Café's
 * threshold plus its Reward, each its own card with the progress shown as beans.
 * Each Café is an independent program (ADR 0001), so there is deliberately no
 * combined total. Empty (1e/1o) is the Берегиня first-Зернятко invitation; a
 * fetch error is a danger strip with retry (pattern 1d).
 *
 * `reloadSignal` carries the id of a freshly-arrived Ворожка reveal: a reveal
 * means the CafeOwner just scanned, so a Зернятко landed and this list is stale.
 * The on-focus refetch in `useBalances` can't catch it — the reveal is a Modal,
 * not a route, so home never blurs — hence we refresh here when the signal
 * changes, keeping the reward-ready card (1f) in step behind the reveal so it is
 * already correct once the Customer dismisses it.
 */
export function CafeBalances({
  reloadSignal,
}: {
  reloadSignal?: string | null;
}) {
  const t = useTheme();
  const { balances, error, reload } = useBalances();
  // The Café whose Redemption sheet is open, if any (1g).
  const [redeeming, setRedeeming] = useState<CafeBalance | null>(null);

  useEffect(() => {
    if (reloadSignal) void reload();
  }, [reloadSignal, reload]);

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
      <CafeCardHeader cafe={cafe} />
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
      <Button title="Як отримати" testID="cafe-redeem" onPress={onRedeem} />
    </Surface>
  );
}
