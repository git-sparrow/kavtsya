import type { z } from "zod";
import type {
  CampaignConfig,
  ManualEntryConfig,
  QrTokenConfig,
  RewardDefaults,
} from "@kavtsya/shared";
import {
  campaignConfigSchema,
  manualEntryConfigSchema,
  qrTokenConfigSchema,
  rewardDefaultsSchema,
} from "@kavtsya/shared";
import type { Clock } from "./clock";
import type { Database } from "./db";

/**
 * How long a read is served from memory before re-querying. Platform config is
 * near-constant and tuned rarely, but it's read on hot paths (every Customer's
 * QR poll reads `qr_token`), so a short cache collapses many identical reads
 * into one DB round-trip. The cost is an up-to-this-long propagation delay after
 * the Platform changes a value — acceptable for config that changes by hand.
 * Exported so a test can move the injected clock past it by name (#54).
 */
export const PLATFORM_CONFIG_CACHE_TTL_MS = 30_000;

type CacheEntry = { value: unknown; expiresAt: number };

/**
 * Reader for the Platform-owned key/value store (`platform_config`,
 * CONTEXT → Platform): business-level config the Platform tunes without a code
 * deploy. One accessor per key, so no caller picks its own schema or fallback.
 */
export interface PlatformConfig {
  /** The QR-token settings (ttl + grace), ADR 0006. */
  qrToken(): Promise<QrTokenConfig>;
  /** The manual-entry ceiling (#21, ADR 0006). */
  manualEntry(): Promise<ManualEntryConfig>;
  /** The campaign pacing cap (#24). */
  campaigns(): Promise<CampaignConfig>;
  /** The platform-default Reward set (story 38). */
  rewardDefaults(): Promise<RewardDefaults>;
}

/**
 * Safety-net defaults, used only when the row is missing (e.g. the seeding
 * migration hasn't been applied). Each is kept in sync with the value its
 * migration seeds, so a fresh-but-unseeded database degrades to sane behaviour
 * instead of failing: 0005 for `qr_token` — the Customer's only earning path
 * (ADR 0006) — 0009 for the manual-entry ceiling that bounds a colluding pair
 * (#21), and 0011 for the pacing that stops one café burning the platform's
 * push reputation (#24). The Reward set has no safe stand-in, so it degrades to
 * empty: the CafeOwner's chooser shows nothing rather than offering a Reward
 * the Platform never sanctioned.
 */
const DEFAULT_QR_TOKEN_CONFIG: QrTokenConfig = {
  ttlSeconds: 90,
  graceSeconds: 30,
};
const DEFAULT_MANUAL_ENTRY_CONFIG: ManualEntryConfig = { dailyLimit: 3 };
const DEFAULT_CAMPAIGN_CONFIG: CampaignConfig = { dailyLimit: 1 };
const DEFAULT_REWARD_DEFAULTS: RewardDefaults = [];

/**
 * Build a config reader over a database and a clock. The read cache lives in
 * this closure — one per instance, built once in the production entrypoint and
 * once per app in tests — so config state never outlives the app that owns it
 * and no suite has to remember to reset anything (#54).
 *
 * Every value is an untrusted JSONB boundary, so reads validate with the same
 * Zod schema the domain uses, and fall back to the built-in default when the
 * key is absent. Reads are cached for {@link PLATFORM_CONFIG_CACHE_TTL_MS},
 * measured against the injected clock.
 */
export function createPlatformConfig(
  db: Database,
  clock: Clock,
): PlatformConfig {
  const cache = new Map<string, CacheEntry>();

  async function read<T>(
    key: string,
    schema: z.ZodType<T>,
    fallback: unknown,
  ): Promise<T> {
    const now = clock.now().getTime();
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value as T;
    }
    const [row] = await db<{ value: unknown }[]>`
      select "value" from platform_config where "key" = ${key}
    `;
    const value = schema.parse(row?.value ?? fallback);
    cache.set(key, { value, expiresAt: now + PLATFORM_CONFIG_CACHE_TTL_MS });
    return value;
  }

  return {
    qrToken: () =>
      read("qr_token", qrTokenConfigSchema, DEFAULT_QR_TOKEN_CONFIG),
    manualEntry: () =>
      read(
        "manual_entry",
        manualEntryConfigSchema,
        DEFAULT_MANUAL_ENTRY_CONFIG,
      ),
    campaigns: () =>
      read("campaigns", campaignConfigSchema, DEFAULT_CAMPAIGN_CONFIG),
    rewardDefaults: () =>
      read("reward_defaults", rewardDefaultsSchema, DEFAULT_REWARD_DEFAULTS),
  };
}
