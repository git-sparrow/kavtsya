import { StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { ErrorText, Muted, Title } from "@/components/text";
import { colors, radius } from "@/theme/colors";

import { rewardLabel } from "./reward";
import { useBalances } from "./use-balances";

/**
 * The Cafés where the Customer holds Зернятка (#20): balance against the
 * Café's threshold plus its Reward, most recently visited first. Each Café is
 * its own independent program (ADR 0001) — there is deliberately no total.
 */
export function CafeBalances() {
  const { balances, error, reload } = useBalances();

  if (error) {
    return (
      <View style={styles.list}>
        <ErrorText>{error}</ErrorText>
        <Button
          title="Спробувати знову"
          variant="secondary"
          onPress={() => void reload()}
        />
      </View>
    );
  }

  // First load still in flight — the QR above is the screen's main content,
  // so no spinner; the list simply appears.
  if (!balances) return null;

  if (balances.length === 0) {
    return (
      <Muted>Ще немає зернят — покажіть свій QR-код у кав&apos;ярні</Muted>
    );
  }

  return (
    <View style={styles.list}>
      {balances.map((b) => (
        <View key={b.cafeId} style={styles.row}>
          <Title>{b.cafeName}</Title>
          <Muted>
            Зернятка: {b.balance} з {b.threshold}
            {b.reward ? ` · ${rewardLabel(b.reward)}` : ""}
          </Muted>
          {b.balance >= b.threshold && (
            <Muted style={styles.ready}>Назбирано на винагороду!</Muted>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    alignSelf: "stretch",
    gap: 10,
  },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 2,
  },
  ready: {
    color: colors.accent,
    fontWeight: "600",
  },
});
