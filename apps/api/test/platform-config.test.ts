import { afterAll, beforeAll, expect, test } from "vitest";
import type { Clock } from "../src/clock";
import type { Database } from "../src/db";
import {
  createPlatformConfig,
  PLATFORM_CONFIG_CACHE_TTL_MS,
} from "../src/platform-config";
import {
  withPlatformConfig,
  withoutPlatformConfig,
} from "./helpers/platform-config";
import { setupTestDb } from "./helpers/testDb";

/**
 * The Platform-config reader (#54). The cache is per reader instance and its
 * TTL is measured against the injected clock, so both are observable from the
 * outside: a test moves the clock rather than reaching into module state.
 */

let db: Database;

beforeAll(async () => {
  db = await setupTestDb();
});

afterAll(async () => {
  await db?.end();
});

/** A clock the test drives by hand — the seam the TTL is measured against. */
function movableClock(start: Date): Clock & { advance(ms: number): void } {
  let now = start.getTime();
  return {
    now: () => new Date(now),
    advance: (ms) => {
      now += ms;
    },
  };
}

test("a repeat read within the TTL is served from memory, not the database", async () => {
  const clock = movableClock(new Date("2026-07-05T09:00:00Z"));
  const config = createPlatformConfig(db, clock);

  const before = await config.qrToken();

  await withPlatformConfig(
    db,
    "qr_token",
    { ttlSeconds: 5, graceSeconds: 1 },
    async () => {
      // The row changed underneath, but this reader already answered for the key.
      clock.advance(PLATFORM_CONFIG_CACHE_TTL_MS - 1);
      expect(await config.qrToken()).toEqual(before);
    },
  );
});

test("a read past the TTL picks up the Platform's new value", async () => {
  const clock = movableClock(new Date("2026-07-05T09:00:00Z"));
  const config = createPlatformConfig(db, clock);

  await config.qrToken();

  await withPlatformConfig(
    db,
    "qr_token",
    { ttlSeconds: 5, graceSeconds: 1 },
    async () => {
      clock.advance(PLATFORM_CONFIG_CACHE_TTL_MS);
      expect(await config.qrToken()).toEqual({
        ttlSeconds: 5,
        graceSeconds: 1,
      });
    },
  );
});

test("each reader instance caches on its own — no state is shared", async () => {
  const clock = movableClock(new Date("2026-07-05T09:00:00Z"));
  const warmed = createPlatformConfig(db, clock);
  await warmed.qrToken();

  await withPlatformConfig(
    db,
    "qr_token",
    { ttlSeconds: 7, graceSeconds: 2 },
    async () => {
      // A reader built after the write starts cold and sees the current row,
      // which is exactly the isolation a fresh app instance gives a test suite.
      const fresh = createPlatformConfig(db, clock);
      expect(await fresh.qrToken()).toEqual({ ttlSeconds: 7, graceSeconds: 2 });
    },
  );
});

test("a missing row degrades to the built-in default instead of throwing", async () => {
  const clock = movableClock(new Date("2026-07-05T09:00:00Z"));

  // A database where migration 0005 has not seeded `qr_token` yet: the
  // Customer's only earning path still issues tokens (ADR 0006).
  await withoutPlatformConfig(db, "qr_token", async () => {
    const config = createPlatformConfig(db, clock);
    expect(await config.qrToken()).toEqual({
      ttlSeconds: 90,
      graceSeconds: 30,
    });
  });
});

test("a missing Reward set degrades to empty, offering nothing unsanctioned", async () => {
  const clock = movableClock(new Date("2026-07-05T09:00:00Z"));

  // The one key with no safe stand-in: rather than invent a Reward the
  // Platform never sanctioned, the chooser is handed an empty set.
  await withoutPlatformConfig(db, "reward_defaults", async () => {
    const config = createPlatformConfig(db, clock);
    expect(await config.rewardDefaults()).toEqual([]);
  });
});
