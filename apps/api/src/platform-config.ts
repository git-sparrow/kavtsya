import type { z } from "zod";
import type { QrTokenConfig } from "@kavtsya/shared";
import { qrTokenConfigSchema } from "@kavtsya/shared";
import type { Database } from "./db";

/**
 * How long a read is served from memory before re-querying. Platform config is
 * near-constant and tuned rarely, but it's read on hot paths (every Customer's
 * QR poll reads `qr_token`), so a short cache collapses many identical reads
 * into one DB round-trip. The cost is an up-to-this-long propagation delay after
 * the Platform changes a value — acceptable for config that changes by hand.
 */
const CACHE_TTL_MS = 30_000;

type CacheEntry = { value: unknown; expiresAt: number };
const cache = new Map<string, CacheEntry>();

/**
 * The Platform-owned key/value store (`platform_config`, CONTEXT → Platform):
 * business-level config the Platform tunes without a code deploy. Every value is
 * an untrusted JSONB boundary, so reads validate with the same Zod schema the
 * domain uses, and fall back to a supplied default when the key is absent — a
 * not-yet-seeded or deleted row degrades to a sane default rather than throwing.
 * Reads are cached for {@link CACHE_TTL_MS}; see {@link clearPlatformConfigCache}.
 */
export async function readPlatformConfig<T>(
  db: Database,
  key: string,
  schema: z.ZodType<T>,
  fallback: unknown,
): Promise<T> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }
  const [row] = await db<{ value: unknown }[]>`
    select "value" from platform_config where "key" = ${key}
  `;
  const value = schema.parse(row?.value ?? fallback);
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/**
 * Drop all cached config so the next read hits the database. Call after writing
 * `platform_config` directly (tests, or a future Platform-config write path) so
 * the change is observed immediately instead of after the TTL.
 */
export function clearPlatformConfigCache(): void {
  cache.clear();
}

/**
 * Safety-net defaults for the QR-token settings, used only if the `qr_token`
 * row is missing (e.g. migration 0005 not yet applied). Kept in sync with the
 * values that migration seeds so a fresh-but-unseeded DB still issues QR tokens
 * instead of failing the Customer's only earning path (ADR 0006).
 */
const DEFAULT_QR_TOKEN_CONFIG: QrTokenConfig = {
  ttlSeconds: 90,
  graceSeconds: 30,
};

/** The Platform-tunable QR-token settings (ttl + grace), read from `platform_config` (ADR 0006). */
export function getQrTokenConfig(db: Database): Promise<QrTokenConfig> {
  return readPlatformConfig(
    db,
    "qr_token",
    qrTokenConfigSchema,
    DEFAULT_QR_TOKEN_CONFIG,
  );
}
