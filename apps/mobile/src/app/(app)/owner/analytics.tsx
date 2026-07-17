import type { AnalyticsPeriod } from "@kavtsya/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { ErrorText, Muted, OwnerBadge, Title } from "@/components/text";
import { useMe } from "@/features/account/me-context";
import { AnalyticsView } from "@/features/analytics/analytics-view";
import { useAnalytics } from "@/features/analytics/use-analytics";
import { fontFamily, useTheme } from "@/theme";

/** Where a Free owner reaches Kavtsya about Pro — Telegram-first (grilling 2026-07-10). */
const KAVTSYA_TELEGRAM_URL = "https://t.me/kavtsya";
const KAVTSYA_EMAIL = "hello@kavtsya.app";

/** The two presets the API serves, with their toggle copy (#25). */
const PERIODS: { value: AnalyticsPeriod; label: string }[] = [
  { value: "7d", label: "7 днів" },
  { value: "30d", label: "30 днів" },
];

/** A labelled, selectable period pill — a proper button to assistive tech. */
function PeriodPill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Період: ${label}`}
      onPress={onPress}
      style={[
        styles.pill,
        { borderColor: t.c.border, borderRadius: t.radius.md },
        selected && {
          borderColor: t.c.primary,
          backgroundColor: t.c["primary-surface"],
        },
      ]}
    >
      <Title
        style={{
          fontSize: t.font.size.base,
          fontFamily: selected
            ? fontFamily.body.semibold
            : fontFamily.body.regular,
          color: selected ? t.c.foreground : t.c["text-secondary"],
        }}
      >
        {label}
      </Title>
    </Pressable>
  );
}

/** The Pro analytics body: period toggle, then the loaded summary/loading/error. */
function ProAnalytics({ cafeId }: { cafeId: string }) {
  const t = useTheme();
  const [period, setPeriod] = useState<AnalyticsPeriod>("30d");
  const { summary, error, reload } = useAnalytics(cafeId, period);

  return (
    <>
      <View style={styles.toggle}>
        {PERIODS.map((p) => (
          <PeriodPill
            key={p.value}
            label={p.label}
            selected={period === p.value}
            onPress={() => setPeriod(p.value)}
          />
        ))}
      </View>

      {error ? (
        <View style={styles.center}>
          <ErrorText>{error}</ErrorText>
          <Button
            title="Спробувати знову"
            variant="secondary"
            onPress={() => void reload()}
          />
        </View>
      ) : summary ? (
        <AnalyticsView summary={summary} />
      ) : (
        <ActivityIndicator size="large" color={t.c.foreground} />
      )}
    </>
  );
}

/**
 * Analytics in CafeOwner Mode (#25, ADR 0011): on Pro — peak hours and the
 * repeat-vs-new split over a 7d/30d window, derived live from the ledger. On
 * Free — the same screen is the upgrade pitch, framed around the owner's own
 * free teaser number (how many came back this month) so upgrading feels like
 * unlocking more of something already working (story 6).
 */
export default function OwnerAnalytics() {
  const { cafeId } = useLocalSearchParams<{ cafeId: string }>();
  const { me } = useMe();
  const cafe = me?.cafes.find((entry) => entry.id === cafeId);

  return (
    <Screen>
      <Card>
        <OwnerBadge>Аналітика — {cafe?.name ?? ""}</OwnerBadge>

        {cafe?.plan === "pro" ? (
          <ProAnalytics cafeId={cafeId} />
        ) : cafe ? (
          <>
            <Title>Аналітика — це Pro ✨</Title>
            <Muted>
              За останні 30 днів до вас повернулися {cafe.returningCustomers30d}{" "}
              клієнтів. Pro покаже, коли саме вони приходять і скільки серед них
              нових — щоб планувати зміни й акції.
            </Muted>
            <Button
              title="Написати нам у Telegram"
              onPress={() => void Linking.openURL(KAVTSYA_TELEGRAM_URL)}
            />
            <Muted>або {KAVTSYA_EMAIL}</Muted>
          </>
        ) : null}

        <Button
          title="Назад"
          variant="secondary"
          onPress={() => router.back()}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
  },
  pill: {
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  center: {
    alignSelf: "stretch",
    gap: 10,
    alignItems: "center",
  },
});
