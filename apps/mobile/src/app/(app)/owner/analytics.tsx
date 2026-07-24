import type { AnalyticsPeriod, OwnerCafe } from "@kavtsya/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, useColorScheme, View } from "react-native";

import { Button } from "@/components/button";
import { RoleHeader } from "@/components/role-header";
import { Screen } from "@/components/screen";
import { SegmentedControl } from "@/components/segmented-control";
import { StatusStrip } from "@/components/status-strip";
import { Muted, Title } from "@/components/text";
import { useMe } from "@/features/account/me-context";
import {
  AnalyticsSkeleton,
  AnalyticsView,
} from "@/features/analytics/analytics-view";
import { useAnalytics } from "@/features/analytics/use-analytics";
import { ThemeProvider, useTheme } from "@/theme";

/** Where a Free owner reaches Kavtsya about Pro — Telegram-first (grilling 2026-07-10). */
const KAVTSYA_TELEGRAM_URL = "https://t.me/kavtsya";
const KAVTSYA_EMAIL = "hello@kavtsya.app";

/** The two presets the API serves (#25), as the segmented control's options. */
const PERIOD_OPTIONS: {
  value: AnalyticsPeriod;
  label: string;
  testID: string;
}[] = [
  { value: "7d", label: "7 днів", testID: "analytics.period-7d" },
  { value: "30d", label: "30 днів", testID: "analytics.period-30d" },
];

/** The Pro analytics body: period toggle, then the loaded summary / skeleton / error. */
function ProAnalytics({ cafeId }: { cafeId: string }) {
  const t = useTheme();
  const [period, setPeriod] = useState<AnalyticsPeriod>("30d");
  const { summary, error, reload } = useAnalytics(cafeId, period);

  return (
    <View style={{ alignSelf: "stretch", gap: t.space[4] }}>
      <SegmentedControl
        label="Період"
        options={PERIOD_OPTIONS}
        value={period}
        onChange={setPeriod}
      />

      {error ? (
        <View style={{ alignSelf: "stretch", gap: t.space[3] }}>
          <StatusStrip
            testID="analytics.error"
            intent="danger"
            title="Не вдалося завантажити аналітику"
            detail={error}
          />
          <Button
            title="Спробувати знову"
            variant="secondary"
            onPress={() => void reload()}
          />
        </View>
      ) : summary ? (
        <AnalyticsView summary={summary} />
      ) : (
        <AnalyticsSkeleton />
      )}
    </View>
  );
}

/**
 * The Free upgrade pitch (turn 6 restyles this into the 6a OfferCard): framed
 * around the owner's own free teaser number so upgrading feels like unlocking
 * more of something already working (story 6).
 */
function FreePitch({ cafe }: { cafe: OwnerCafe }) {
  const t = useTheme();
  return (
    <View style={{ alignSelf: "stretch", gap: t.space[3] }}>
      <Title style={{ textAlign: "left" }}>Аналітика — це Pro</Title>
      <Muted style={{ textAlign: "left" }}>
        За останні 30 днів до тебе повернулися {cafe.returningCustomers30d}{" "}
        клієнтів. Pro покаже, коли саме вони приходять і скільки серед них нових
        — щоб планувати зміни й акції.
      </Muted>
      <Button
        title="Написати нам у Telegram"
        onPress={() => void Linking.openURL(KAVTSYA_TELEGRAM_URL)}
      />
      <Muted>або {KAVTSYA_EMAIL}</Muted>
    </View>
  );
}

/**
 * Analytics in CafeOwner Mode (#25, ADR 0011; redesign turn 4, screens 4d/4e).
 * On Pro — the 7/30-day segmented control, the active/new/repeat stat trio, and
 * the peak-hours histogram, derived live from the ledger. On Free — the same
 * screen is the upgrade pitch. A role header «АНАЛІТИКА · PRO» + café name; no
 * logo, no bottom «Назад» (the header's back icon is the one way out). Follows
 * the OS colour scheme like the rest of the redesigned owner surface.
 */
export default function OwnerAnalytics() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  return (
    <ThemeProvider theme={scheme}>
      <OwnerAnalyticsBody />
    </ThemeProvider>
  );
}

function OwnerAnalyticsBody() {
  const { cafeId } = useLocalSearchParams<{ cafeId: string }>();
  const { me } = useMe();
  const cafe = me?.cafes.find((entry) => entry.id === cafeId);
  const isPro = cafe?.plan === "pro";

  return (
    <Screen
      header={
        <RoleHeader
          kicker={isPro ? "Аналітика · Pro" : "Аналітика"}
          title={cafe?.name ?? ""}
          action={{
            icon: "chevron-left",
            label: "Назад",
            testID: "analytics.back",
            onPress: () => router.back(),
          }}
        />
      }
    >
      {isPro ? (
        <ProAnalytics cafeId={cafeId} />
      ) : cafe ? (
        <FreePitch cafe={cafe} />
      ) : null}
    </Screen>
  );
}
