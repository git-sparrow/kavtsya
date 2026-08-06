import { afterAll, beforeAll, expect, test } from "vitest";
import {
  kyivDayOf,
  kyivDaySql,
  kyivLocalTimeSql,
  kyivNextMidnight,
} from "../src/clock";
import type { Database } from "../src/db";
import { setupTestDb } from "./helpers/testDb";

/**
 * The business day (#112): the Europe/Kyiv calendar day, encoded twice — once in
 * JS (`kyivDayOf`) and once in SQL (`kyivDaySql`) — which is exactly why both
 * encodings are pinned here against the DST transitions, the only instants where
 * a naive UTC shortcut would disagree. Ukraine switches at 03:00/04:00 local, so
 * the two halves of every switch day sit on different UTC offsets while staying
 * one calendar day.
 */

let db: Database;

beforeAll(async () => {
  db = await setupTestDb();
});

afterAll(async () => {
  await db?.end();
});

/**
 * The 2026 Ukrainian DST switches (EU rule: last Sunday of March / October).
 * Spring: 03:00 EET → 04:00 EEST at 01:00 UTC on 29 March.
 * Autumn: 04:00 EEST → 03:00 EET at 01:00 UTC on 25 October.
 */
const SPRING_FORWARD_EVE = new Date("2026-03-28T12:00:00Z"); // EET (+02:00)
const SPRING_FORWARD_DAY = new Date("2026-03-29T12:00:00Z"); // EEST, post-switch
const FALL_BACK_EVE = new Date("2026-10-24T12:00:00Z"); // EEST (+03:00)
const FALL_BACK_DAY = new Date("2026-10-25T12:00:00Z"); // EET, post-switch

/** Kyiv wall-clock time of an instant, `HH:MM`, for asserting «midnight». */
const kyivTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Kyiv",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// --- the next Kyiv midnight (#80, ADR 0013) ------------------------------------

/**
 * The invariant the two-offset probe exists to hold, whatever the offset: the
 * returned instant IS a Kyiv midnight, it is the FIRST one after `instant`, and
 * one millisecond earlier is still `instant`'s own Kyiv day.
 */
function expectNextKyivMidnight(instant: Date, expectedUtc: string): void {
  const midnight = kyivNextMidnight(instant);
  expect(midnight.toISOString()).toBe(expectedUtc);
  expect(kyivTimeFormat.format(midnight)).toBe("00:00");
  expect(kyivDayOf(midnight)).not.toBe(kyivDayOf(instant));
  expect(kyivDayOf(new Date(midnight.getTime() - 1))).toBe(kyivDayOf(instant));
}

test("next Kyiv midnight lands on the EET offset the night before spring forward", () => {
  // 29 March starts at +02:00 (the switch is at 03:00), so midnight is UTC 22:00.
  expectNextKyivMidnight(SPRING_FORWARD_EVE, "2026-03-28T22:00:00.000Z");
});

test("next Kyiv midnight lands on the EEST offset on the spring-forward day", () => {
  // The day has already switched to +03:00, so its end is UTC 21:00.
  expectNextKyivMidnight(SPRING_FORWARD_DAY, "2026-03-29T21:00:00.000Z");
});

test("next Kyiv midnight lands on the EEST offset the night before fall back", () => {
  // 25 October begins at +03:00 (the switch is at 04:00): UTC 21:00.
  expectNextKyivMidnight(FALL_BACK_EVE, "2026-10-24T21:00:00.000Z");
});

test("next Kyiv midnight lands on the EET offset on the fall-back day", () => {
  // The day has already switched back to +02:00, so its end is UTC 22:00.
  expectNextKyivMidnight(FALL_BACK_DAY, "2026-10-25T22:00:00.000Z");
});

// --- the SQL encoding agrees with the JS one -----------------------------------

/** Every instant a Kyiv-day query and a JS helper could disagree about. */
const BOUNDARY_INSTANTS = [
  new Date("2026-03-28T21:59:59.999Z"), // last ms of 28 March, Kyiv
  new Date("2026-03-28T22:00:00.000Z"), // first ms of 29 March, Kyiv
  new Date("2026-03-29T01:00:00.000Z"), // the spring-forward switch itself
  new Date("2026-03-29T21:00:00.000Z"), // first ms of 30 March, Kyiv
  new Date("2026-10-24T20:59:59.999Z"), // last ms of 24 October, Kyiv
  new Date("2026-10-25T01:00:00.000Z"), // the fall-back switch itself
  new Date("2026-10-25T21:59:59.999Z"), // last ms of 25 October, Kyiv
  new Date("2026-10-25T22:00:00.000Z"), // first ms of 26 October, Kyiv
  new Date("2026-01-15T22:30:00.000Z"), // a plain winter evening past UTC midnight
  new Date("2026-07-15T21:30:00.000Z"), // a plain summer evening past UTC midnight
];

/** One instant as a one-row, one-column table the fragments can be aimed at. */
function instantRow(instant: Date) {
  return db`(select ${instant}::timestamptz as "at") as t`;
}

test("the SQL Kyiv day matches the JS Kyiv day across both DST transitions", async () => {
  for (const instant of BOUNDARY_INSTANTS) {
    const [row] = await db<{ day: string }[]>`
      select to_char(${kyivDaySql(db, "at", "t")}, 'YYYY-MM-DD') as day
      from ${instantRow(instant)}
    `;

    expect(row?.day, instant.toISOString()).toBe(kyivDayOf(instant));
  }
});

test("the SQL Kyiv local time carries the hour analytics buckets by", async () => {
  // 21:30 UTC in July is 00:30 the NEXT Kyiv day — the bucket a UTC-naive
  // `extract(hour ...)` would file under 21 the day before.
  const summerEvening = new Date("2026-07-15T21:30:00.000Z");
  const [row] = await db<{ hour: number }[]>`
    select extract(hour from ${kyivLocalTimeSql(db, "at", "t")})::int as hour
    from ${instantRow(summerEvening)}
  `;

  expect(row?.hour).toBe(0);
  expect(kyivDayOf(summerEvening)).toBe("2026-07-16");
});

test("the SQL Kyiv day accepts an expression, not just a column", async () => {
  // The shift board's shape: `coalesce(revoked_at, expires_at)` bucketed by day.
  const lastMomentOfFallBackDay = new Date("2026-10-25T21:59:59.999Z");
  const [row] = await db<{ day: string }[]>`
    select to_char(
      ${kyivDaySql(db, db`coalesce(null::timestamptz, t."at")`)},
      'YYYY-MM-DD'
    ) as day
    from ${instantRow(lastMomentOfFallBackDay)}
  `;

  expect(row?.day).toBe("2026-10-25");
});
