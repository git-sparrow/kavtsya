import type { AnalyticsPeriod } from "@kavtsya/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, View } from "react-native";

import { Button } from "@/components/button";
import { OfferCard, PriceStrip } from "@/components/offer-card";
import { RoleHeader } from "@/components/role-header";
import { Screen } from "@/components/screen";
import { SegmentedControl } from "@/components/segmented-control";
import { StatusStrip } from "@/components/status-strip";
import { Muted } from "@/components/text";
import { useMe } from "@/features/account/me-context";
import {
  AnalyticsSkeleton,
  AnalyticsView,
} from "@/features/analytics/analytics-view";
import { useAnalytics } from "@/features/analytics/use-analytics";
import { useTheme } from "@/theme";

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

/** The three promises Pro Аналітика buys — the last cross-sells Розсилка (5a's twin). */
const ANALYTICS_CHECKS = [
  "Пікові години — коли ставити другого бариста",
  "Нові та постійні клієнти — за 7 чи 30 днів",
  "Разом з Розсилкою: розкажи постійним про нове",
];

/**
 * The chart the pitch is selling, as a 12-bar silhouette with the peak trio in
 * solid `primary` (6a). Deliberately fake and deliberately unreadable in detail:
 * it shows the *shape* of the answer Pro gives, so it carries no numbers and is
 * hidden from assistive tech — the checklist below states the same promise in words.
 */
const PREVIEW_BARS = [
  0.2, 0.3, 0.26, 0.46, 0.34, 0.54, 0.74, 0.94, 0.78, 0.42, 0.3, 0.22,
];
/** Indices of the peak trio — the bars drawn solid `primary`. */
const PREVIEW_PEAKS = [6, 7, 8];
const PREVIEW_HEIGHT = 58;

function ChartPreview() {
  const t = useTheme();
  // Turn-4 chart rule: quiet bars are `primary-surface` in light, `raised` in
  // dark (where `primary-surface` collapses onto the card's own surface).
  const nonPeak = t.themeName === "dark" ? t.c.raised : t.c["primary-surface"];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 4,
        height: PREVIEW_HEIGHT,
        marginTop: t.space[1],
      }}
    >
      {PREVIEW_BARS.map((share, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: share * PREVIEW_HEIGHT,
            backgroundColor: PREVIEW_PEAKS.includes(i) ? t.c.primary : nonPeak,
            // A hair of rounding, not `radius-sm`: at these heights the token's
            // 10px turns the quiet bars into domes instead of bars.
            borderTopLeftRadius: 4,
            borderTopRightRadius: 4,
          }}
        />
      ))}
    </View>
  );
}

/**
 * The Free upgrade pitch (6a/6h) — the twin of the 5a Розсилка pitch: the shared
 * `OfferCard` with a serif promise, the chart preview as proof, and a checklist
 * whose last line cross-sells Розсилка exactly as 5a cross-sells Аналітика. The
 * price strip carries the v1 upgrade path (ADR 0011): Pro is flipped by hand
 * after a Telegram conversation, so the numbers must be on the screen.
 */
function FreePitch() {
  return (
    <>
      <OfferCard
        testID="analytics.offer"
        promise="Побач, коли твоя кав'ярня жива"
        checks={ANALYTICS_CHECKS}
      >
        <ChartPreview />
      </OfferCard>
      <PriceStrip />
      <View style={{ flex: 1 }} />
      <Button
        title="Написати нам у Telegram"
        testID="analytics.telegram"
        onPress={() => void Linking.openURL(KAVTSYA_TELEGRAM_URL)}
      />
      <Muted>або {KAVTSYA_EMAIL}</Muted>
    </>
  );
}

/**
 * Analytics in CafeOwner Mode (#25, ADR 0011; redesign turns 4d/4e + 6a/6h).
 * On Pro — the 7/30-day segmented control, the active/new/repeat stat trio, and
 * the peak-hours histogram, derived live from the ledger. On Free — the same
 * screen is the upgrade pitch. A role header «АНАЛІТИКА · PRO» + café name; no
 * logo, no bottom «Назад» (the header's back icon is the one way out). Renders
 * in the theme chosen in Settings → ВИГЛЯД, like the rest of the owner surface.
 */
export default function OwnerAnalytics() {
  const { cafeId } = useLocalSearchParams<{ cafeId: string }>();
  const { me } = useMe();
  const cafe = me?.cafes.find((entry) => entry.id === cafeId);
  const isPro = cafe?.plan === "pro";

  return (
    <Screen
      header={
        <RoleHeader
          // «АНАЛІТИКА · PRO» on both sides (4d and 6a): the kicker names the
          // feature's tier, like the PRO pill on the owner home's menu row.
          kicker="Аналітика · PRO"
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
      {isPro ? <ProAnalytics cafeId={cafeId} /> : cafe ? <FreePitch /> : null}
    </Screen>
  );
}
