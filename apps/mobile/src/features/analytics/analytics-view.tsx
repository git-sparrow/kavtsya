import type { AnalyticsSummary } from "@kavtsya/shared";
import { StyleSheet, View } from "react-native";

import { Muted, SectionLabel, Title } from "@/components/text";
import { CLIENT_FORMS, pluralizeUk } from "@/lib/plural";
import { useTheme } from "@/theme";

/** Bars this tall at the busiest Kyiv hour; quieter hours scale down from here. */
const CHART_HEIGHT = 96;

/** The Kyiv hours we tick-label under the chart — dawn, midday, evening, night. */
const HOUR_TICKS = [0, 6, 12, 18];

/** Two-digit Kyiv hour label, e.g. `09:00`. */
function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** One split figure — a big number over its label, e.g. «12 / Повернулися». */
function Stat({ value, label }: { value: number; label: string }) {
  const t = useTheme();
  return (
    <View style={styles.stat}>
      <Title style={{ fontSize: t.font.size["2xl"], color: t.c.foreground }}>
        {value}
      </Title>
      <Muted>{label}</Muted>
    </View>
  );
}

/**
 * The peak-hours histogram (#25): one bar per Kyiv hour (0–23), scaled to the
 * busiest hour. Decorative to a screen reader — the chart's meaning is spoken by
 * one summary label naming the busiest hour, so the 24 bars are hidden from
 * assistive tech rather than read one by one.
 */
function PeakHours({ hourly }: { hourly: number[] }) {
  const t = useTheme();
  const max = Math.max(...hourly);
  const busiest = hourly.indexOf(max);
  const summary =
    max > 0
      ? `Найбільше зернят близько ${hourLabel(busiest)}`
      : "Ще немає зернят за цей період";

  return (
    <View style={styles.chartBlock}>
      <SectionLabel>Пікові години (за Києвом)</SectionLabel>
      <View
        style={[styles.chart, { height: CHART_HEIGHT }]}
        accessibilityRole="image"
        accessibilityLabel={summary}
      >
        {hourly.map((count, hour) => (
          <View
            key={hour}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.bar,
              {
                height: max > 0 ? Math.max(2, (count / max) * CHART_HEIGHT) : 2,
                backgroundColor:
                  count > 0 && hour === busiest
                    ? t.c.primary
                    : count > 0
                      ? t.c["primary-surface"]
                      : t.c.border,
                borderRadius: t.radius.sm,
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.ticks}>
        {HOUR_TICKS.map((h) => (
          <Muted key={h} style={styles.tick}>
            {hourLabel(h)}
          </Muted>
        ))}
      </View>
      <Muted style={styles.caption}>{summary}</Muted>
    </View>
  );
}

/**
 * A loaded analytics summary (#25): the active/new/repeat split and the
 * peak-hours chart. The empty state is honest — a brand-new café shows «ще немає
 * даних», never zeros dressed as a chart (story 7). The Pro gate and period
 * toggle live in the screen; this only renders numbers it is handed.
 */
export function AnalyticsView({ summary }: { summary: AnalyticsSummary }) {
  if (summary.activeCustomers === 0) {
    return (
      <View style={styles.empty}>
        <Title>Ще немає даних</Title>
        <Muted>
          Щойно клієнти почнуть збирати зернятка, тут з&apos;являться пікові
          години та скільки з них повертається.
        </Muted>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <View style={styles.stats}>
        <Stat value={summary.activeCustomers} label="Активні" />
        <Stat value={summary.newCustomers} label="Нові" />
        <Stat value={summary.repeatCustomers} label="Повернулися" />
      </View>
      <Muted>
        {summary.repeatCustomers}{" "}
        {pluralizeUk(summary.repeatCustomers, CLIENT_FORMS)} повернулися до вас
        за цей період.
      </Muted>
      <PeakHours hourly={summary.hourly} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    alignSelf: "stretch",
    gap: 16,
  },
  empty: {
    alignSelf: "stretch",
    gap: 8,
    alignItems: "center",
  },
  stats: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  stat: {
    alignItems: "center",
    gap: 2,
  },
  chartBlock: {
    alignSelf: "stretch",
    gap: 6,
  },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  bar: {
    flex: 1,
  },
  ticks: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  tick: {
    fontSize: 10,
  },
  caption: {
    textAlign: "left",
  },
});
