import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AIProvider } from "../src/ai";
import { fixedClock } from "../src/clock";
import type { Database } from "../src/db";
import { generateDailyFortunes, pickFortune } from "../src/fortunes";
import { setupTestDb } from "./helpers/testDb";

/**
 * The fortunes-pool seam (#23, ADR 0009): a scheduled job fills a per-day pool
 * through the AIProvider; the scan later reads a random fortune from it. The
 * provider is always a fake here — no test may reach a live model — and days
 * are pinned via the injected clock. "Day" means the Europe/Kyiv calendar day:
 * the pool must roll over at Kyiv midnight, not server/UTC midnight.
 */

let db: Database;

beforeAll(async () => {
  db = await setupTestDb();
});

afterAll(async () => {
  await db?.end();
});

beforeEach(async () => {
  await db`truncate fortunes`;
});

/** A fake provider that returns a canned batch and records what it was asked. */
function fakeProvider(fortunes: string[]) {
  const requestedCounts: number[] = [];
  const provider: AIProvider = {
    async generateFortunes(count) {
      requestedCounts.push(count);
      return fortunes;
    },
  };
  return { provider, requestedCounts };
}

// 12:00 UTC on 2026-07-09 is 15:00 in Kyiv (UTC+3, summer) — mid-day, no edge.
const KYIV_MIDDAY = new Date("2026-07-09T12:00:00Z");

describe("generateDailyFortunes", () => {
  it("fills today's pool through the provider so a scan can draw from it", async () => {
    const { provider } = fakeProvider(["Кава сьогодні на щастя."]);
    await generateDailyFortunes(db, {
      provider,
      clock: fixedClock(KYIV_MIDDAY),
    });

    const fortune = await pickFortune(db, fixedClock(KYIV_MIDDAY));
    expect(fortune).toBe("Кава сьогодні на щастя.");
  });

  it("keys the pool to the Kyiv calendar day, not the UTC one", async () => {
    // 22:30 UTC on the 8th is already 01:30 on the 9th in Kyiv (UTC+3).
    const lateEveningUtc = new Date("2026-07-08T22:30:00Z");
    const { provider } = fakeProvider(["Ранкова кава принесе новину."]);
    await generateDailyFortunes(db, {
      provider,
      clock: fixedClock(lateEveningUtc),
    });

    // Same Kyiv day (July 9th) sees the batch…
    expect(await pickFortune(db, fixedClock(KYIV_MIDDAY))).toBe(
      "Ранкова кава принесе новину.",
    );
    // …while July 8th in Kyiv does not — the pool belongs to the 9th.
    expect(
      await pickFortune(db, fixedClock(new Date("2026-07-08T12:00:00Z"))),
    ).toBeNull();
  });

  it("is idempotent: a second run on the same day neither calls the provider nor grows the pool", async () => {
    const first = fakeProvider(["Єдине ворожіння дня."]);
    const second = fakeProvider(["Зайве ворожіння."]);
    const clock = fixedClock(KYIV_MIDDAY);

    await generateDailyFortunes(db, { provider: first.provider, clock });
    await generateDailyFortunes(db, { provider: second.provider, clock });

    expect(second.requestedCounts).toEqual([]);
    expect(await pickFortune(db, clock)).toBe("Єдине ворожіння дня.");
  });

  it("leaves the pool untouched when the provider fails", async () => {
    const failing: AIProvider = {
      async generateFortunes() {
        throw new Error("Claude Messages API responded 529");
      },
    };
    const clock = fixedClock(KYIV_MIDDAY);

    await expect(
      generateDailyFortunes(db, { provider: failing, clock }),
    ).rejects.toThrow(/529/);
    expect(await pickFortune(db, clock)).toBeNull();
  });
});
