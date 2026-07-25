import type { AnalyticsSummary } from "@kavtsya/shared";
import { View } from "react-native";

import { Berehynia } from "@/components/berehynia";
import { StatCard } from "@/components/stat-card";
import { Surface } from "@/components/surface";
import { Heading, Muted, SectionLabel } from "@/components/text";
import {
  CHART_HOURS,
  CHART_TICKS,
  hourLabel,
  peakHour,
  peakInsight,
} from "@/features/analytics/chart";
import { useTheme } from "@/theme";

/** Bars this tall at the busiest hour of the drawn window; quieter hours scale down. */
const CHART_HEIGHT = 96;

/** The one-line glossary under the trio — each card never defines its own metric. */
const GLOSSARY =
  "Активні — з покупкою за період · Нові — перше зернятко · Повернулися — прийшли вдруге";

/** The active / new / repeat split (4d): «Повернулися» is the accented metric. */
function StatTrio({
  summary,
  loading = false,
}: {
  summary?: AnalyticsSummary;
  loading?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: t.space[3] }}>
      <StatCard
        loading={loading}
        value={summary?.activeCustomers ?? 0}
        label="Активні"
      />
      <StatCard
        loading={loading}
        value={summary?.newCustomers ?? 0}
        label="Нові"
      />
      <StatCard
        loading={loading}
        accent
        value={summary?.repeatCustomers ?? 0}
        label="Повернулися"
      />
    </View>
  );
}

/**
 * The peak-hours histogram (4d): the insight promoted to a serif headline over
 * 18 bars across the café day (06:00–24:00). The busiest hour is solid `primary`;
 * quieter hours are `primary-surface` (light) / `raised` (dark — `primary-surface`
 * collapses onto `surface` there); the hairline baseline carries 06/12/18/24
 * ticks. The bars are decorative — one accessible summary speaks the peak, so a
 * screen-reader hears the meaning instead of 18 anonymous bars.
 */
function PeakHours({ hourly }: { hourly: number[] }) {
  const t = useTheme();
  const isDark = t.themeName === "dark";
  const { headline, summary } = peakInsight(hourly);
  const peak = peakHour(hourly);
  const windowMax = Math.max(0, ...CHART_HOURS.map((h) => hourly[h]));
  const nonPeak = isDark ? t.c.raised : t.c["primary-surface"];

  return (
    <Surface>
      <View style={{ gap: 2 }}>
        <SectionLabel>Пікові години</SectionLabel>
        <Heading size={22}>{headline}</Heading>
      </View>

      <View
        accessibilityRole="image"
        accessibilityLabel={summary}
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 3,
          height: CHART_HEIGHT,
          borderBottomWidth: 1,
          borderBottomColor: t.c.border,
          paddingBottom: 2,
        }}
      >
        {CHART_HOURS.map((hour) => {
          const count = hourly[hour];
          const height =
            windowMax > 0 ? Math.max(3, (count / windowMax) * CHART_HEIGHT) : 3;
          const color =
            hour === peak ? t.c.primary : count > 0 ? nonPeak : t.c.border;
          return (
            <View
              key={hour}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                flex: 1,
                height,
                backgroundColor: color,
                borderTopLeftRadius: t.radius.sm,
                borderTopRightRadius: t.radius.sm,
              }}
            />
          );
        })}
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {CHART_TICKS.map((h) => (
          <Muted key={h} style={{ fontSize: 12 }}>
            {hourLabel(h)}
          </Muted>
        ))}
      </View>
    </Surface>
  );
}

/**
 * The loaded Pro analytics (4d/4e): the stat trio + glossary, then the peak-hours
 * card. A brand-new café is honest — «ще замало даних» with the Берегиня mark,
 * never zeros dressed as a chart. The Pro gate, period toggle, loading, and error
 * live in the screen; this only renders numbers it is handed.
 */
export function AnalyticsView({ summary }: { summary: AnalyticsSummary }) {
  const t = useTheme();

  if (summary.activeCustomers === 0) {
    return (
      <View
        style={{
          alignSelf: "stretch",
          alignItems: "center",
          gap: t.space[3],
          paddingVertical: t.space[6],
        }}
      >
        <Berehynia size={28} />
        <Muted>
          Ще замало даних — графіки з&apos;являться після перших сканів
        </Muted>
      </View>
    );
  }

  return (
    <View style={{ alignSelf: "stretch", gap: t.space[4] }}>
      <StatTrio summary={summary} />
      <Muted style={{ textAlign: "left" }}>{GLOSSARY}</Muted>
      <PeakHours hourly={summary.hourly} />
    </View>
  );
}

/**
 * The between-loads skeleton (4d loading): the trio as dim value bars over a
 * quiet chart card, so switching periods keeps the layout steady instead of
 * collapsing to a spinner. Hidden from assistive tech — nothing to announce yet.
 */
export function AnalyticsSkeleton() {
  const t = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ alignSelf: "stretch", gap: t.space[4] }}
    >
      <StatTrio loading />
      <Surface>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: 3,
            height: CHART_HEIGHT,
          }}
        >
          {CHART_HOURS.map((hour, i) => (
            <View
              key={hour}
              style={{
                flex: 1,
                height: 12 + ((i * 37) % 60),
                backgroundColor: t.c.foreground,
                opacity: 0.2,
                borderTopLeftRadius: t.radius.sm,
                borderTopRightRadius: t.radius.sm,
              }}
            />
          ))}
        </View>
      </Surface>
    </View>
  );
}
