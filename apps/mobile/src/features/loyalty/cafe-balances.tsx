import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/button";
import { Surface } from "@/components/surface";
import { ErrorText, Muted, Title } from "@/components/text";
import { fontFamily, useTheme } from "@/theme";

import { rewardLabel } from "./reward";
import { useBalances } from "./use-balances";

/** Beyond this many, dots would overflow the row — the count carries it instead. */
const MAX_DOTS = 12;

/** Ukrainian count agreement for «зернятко» so "1 зернятко / 3 зернятка / 7 зернят" reads right. */
function pluralizeBeans(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "зернятко";
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) {
    return "зернятка";
  }
  return "зернят";
}

/** A row of beans filled to the Customer's balance — the progress at a glance. */
function BeanProgress({
  balance,
  threshold,
}: {
  balance: number;
  threshold: number;
}) {
  const t = useTheme();
  if (threshold > MAX_DOTS) return null;
  return (
    <View style={styles.dots}>
      {Array.from({ length: threshold }, (_, i) => (
        <View
          key={i}
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: i < balance ? t.c.primary : t.c["primary-surface"],
            borderWidth: i < balance ? 0 : 1,
            borderColor: t.c.border,
          }}
        />
      ))}
    </View>
  );
}

/** The gold "Готово" pill on a Café whose Reward is ready to claim. */
function ReadyChip() {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: t.c.primary,
        borderRadius: t.radius.full,
        paddingHorizontal: 10,
        paddingVertical: 3,
      }}
    >
      <Text
        style={{
          color: t.c["primary-foreground"],
          fontFamily: fontFamily.body.bold,
          fontSize: t.font.size.xs,
        }}
      >
        ✓ Готово
      </Text>
    </View>
  );
}

/**
 * The Cafés where the Customer holds Зернятка (#20): balance against the Café's
 * threshold plus its Reward, most recently visited first — grouped in one card
 * with the progress shown as beans. Each Café is its own independent program
 * (ADR 0001), so there is deliberately no combined total.
 */
export function CafeBalances() {
  const { balances, error, reload } = useBalances();

  if (error) {
    return (
      <View style={styles.errorBox}>
        <ErrorText>{error}</ErrorText>
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
      <Muted>Ще немає зернят — покажіть свій QR-код у кав&apos;ярні</Muted>
    );
  }

  return (
    <Surface style={styles.card}>
      {balances.map((b) => {
        const ready = b.balance >= b.threshold;
        return (
          <View key={b.cafeId} style={styles.row}>
            <View style={styles.rowHeader}>
              <Title style={styles.name}>{b.cafeName}</Title>
              {ready && <ReadyChip />}
            </View>
            <Muted style={styles.detail}>
              {ready
                ? `Винагорода готова!${b.reward ? ` · ${rewardLabel(b.reward)}` : ""}`
                : `${b.balance} ${pluralizeBeans(b.balance)} · ще ${b.threshold - b.balance} до Винагороди`}
            </Muted>
            <BeanProgress balance={b.balance} threshold={b.threshold} />
          </View>
        );
      })}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 18,
  },
  errorBox: {
    alignSelf: "stretch",
    gap: 10,
  },
  row: {
    gap: 6,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  name: {
    flexShrink: 1,
    textAlign: "left",
  },
  detail: {
    textAlign: "left",
  },
  dots: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 2,
  },
});
