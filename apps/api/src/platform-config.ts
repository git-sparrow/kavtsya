import type { z } from "zod";
import type { QrTokenConfig } from "@kavtsya/shared";
import { qrTokenConfigSchema } from "@kavtsya/shared";
import type { Database } from "./db";

/**
 * The Platform-owned key/value store (`platform_config`, CONTEXT → Platform):
 * business-level config the Platform tunes without a code deploy. Every value is
 * an untrusted JSONB boundary, so reads validate with the same Zod schema the
 * domain uses, and fall back to a supplied default when the key is absent — a
 * not-yet-seeded or deleted row degrades to a sane default rather than throwing.
 */
export async function readPlatformConfig<T>(
  db: Database,
  key: string,
  schema: z.ZodType<T>,
  fallback: unknown,
): Promise<T> {
  const [row] = await db<{ value: unknown }[]>`
    select "value" from platform_config where "key" = ${key}
  `;
  return schema.parse(row?.value ?? fallback);
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
