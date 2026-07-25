import { describe, expect, it } from "vitest";

import {
  CHART_HOURS,
  hourLabel,
  peakHour,
  peakInsight,
} from "../src/features/analytics/chart";

/** A 24-slot Kyiv-hour histogram with `count` at `hour`, zeros elsewhere. */
function hourlyWith(entries: Record<number, number>): number[] {
  return Array.from({ length: 24 }, (_, h) => entries[h] ?? 0);
}

describe("hourLabel", () => {
  it("zero-pads to a two-digit Kyiv hour", () => {
    expect(hourLabel(6)).toBe("06:00");
    expect(hourLabel(19)).toBe("19:00");
  });

  it("labels the closing gridline 24:00", () => {
    expect(hourLabel(24)).toBe("24:00");
  });
});

describe("CHART_HOURS", () => {
  it("spans the café day 06:00–23:00 as one bar per hour", () => {
    expect(CHART_HOURS[0]).toBe(6);
    expect(CHART_HOURS.at(-1)).toBe(23);
    expect(CHART_HOURS).toHaveLength(18);
  });
});

describe("peakHour", () => {
  it("is null when nothing was earned", () => {
    expect(peakHour(hourlyWith({}))).toBeNull();
  });

  it("returns the busiest hour", () => {
    expect(peakHour(hourlyWith({ 8: 3, 19: 7, 20: 4 }))).toBe(19);
  });

  it("resolves ties to the earliest hour", () => {
    expect(peakHour(hourlyWith({ 9: 5, 15: 5 }))).toBe(9);
  });

  it("reports a peak outside the drawn 06–24 window so the summary never lies", () => {
    // Pre-dawn office bulk order — off the axis, but still the true busiest hour.
    expect(peakHour(hourlyWith({ 3: 9, 10: 2 }))).toBe(3);
  });
});

describe("peakInsight", () => {
  it("names the busiest hour in the serif headline and the spoken summary", () => {
    const { headline, summary } = peakInsight(hourlyWith({ 19: 7 }));
    expect(headline).toContain("19:00");
    expect(headline).not.toContain("Києв"); // «за Києвом» qualifier dropped per review
    expect(summary).toContain("19:00");
  });

  it("degrades to an honest no-data line when the day is empty", () => {
    const { headline, summary } = peakInsight(hourlyWith({}));
    expect(headline.length).toBeGreaterThan(0);
    expect(summary.length).toBeGreaterThan(0);
    expect(headline).not.toContain(":00");
  });
});
