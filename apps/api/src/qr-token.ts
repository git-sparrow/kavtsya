import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Clock } from "./clock";
import {
  decodeSignedToken,
  deriveTokenKey,
  encodeSignedToken,
} from "./signed-token";

/**
 * The Customer's rotating QR token (ADR 0006): a short-lived, HMAC-signed token
 * the app shows and the CafeOwner's scanner validates server-side before issuing
 * a Зернятко. This is a pure seam — no DB, no I/O — driven by an injectable
 * `Clock` so expiry and grace are deterministic under test.
 *
 * The token is a compact `<body>.<sig>` pair: `body` is the base64url-encoded
 * JSON payload, `sig` is its base64url HMAC-SHA256. We both sign and verify it
 * ourselves, so a self-contained format is enough — no JWT interop is needed.
 * `exp`/`iat` are epoch seconds; `jti` is the unique per-token id that the scan
 * slice (#20) records to make earning single-use.
 */

/**
 * The signed token's claims. Validated on the way back in (not just cast), so a
 * structurally-incomplete-but-correctly-signed token — e.g. a future bug that
 * signs a payload with an undefined `sub`/`exp` — is rejected as `malformed`
 * rather than silently treated as a never-expiring token for Customer
 * `undefined`. `exp`/`iat` are epoch seconds.
 */
const qrTokenPayloadSchema = z.object({
  /** The Customer the token authenticates (`user.id`). */
  sub: z.string().min(1),
  /** Unique token id — basis for single-use earning (ADR 0006). */
  jti: z.string().min(1),
  /** Issued-at, epoch seconds. */
  iat: z.number(),
  /** Expiry, epoch seconds (iat + ttl). */
  exp: z.number(),
});
type QrTokenPayload = z.infer<typeof qrTokenPayloadSchema>;

export interface SignQrTokenOptions {
  clock: Clock;
  /** HMAC signing secret (`QR_TOKEN_SECRET`). */
  secret: string;
  /** Token lifetime in seconds (Platform-tunable). */
  ttlSeconds: number;
}

export interface SignedQrToken {
  token: string;
  jti: string;
  expiresAt: Date;
}

export interface ValidateQrTokenOptions {
  clock: Clock;
  secret: string;
  /** Slack past `exp` to absorb clock skew / brief signal loss (Platform-tunable). */
  graceSeconds: number;
}

/** Why a token failed validation — named so the wire mapping (#50) can be exhaustive over it. */
export type QrTokenInvalidReason = "malformed" | "bad_signature" | "expired";

export type QrTokenValidation =
  | { valid: true; customerId: string; jti: string }
  | { valid: false; reason: QrTokenInvalidReason };

export function signQrToken(
  customerId: string,
  { clock, secret, ttlSeconds }: SignQrTokenOptions,
): SignedQrToken {
  const iat = Math.floor(clock.now().getTime() / 1000);
  const exp = iat + ttlSeconds;
  const jti = randomUUID();
  const payload: QrTokenPayload = { sub: customerId, jti, iat, exp };

  // Signed under the QR family's derived key (#80): a shift invite signed off
  // the same secret can never scan as a Customer QR, and vice versa.
  const token = encodeSignedToken(payload, deriveTokenKey(secret, "qr"));

  return { token, jti, expiresAt: new Date(exp * 1000) };
}

export function validateQrToken(
  token: string,
  { clock, secret, graceSeconds }: ValidateQrTokenOptions,
): QrTokenValidation {
  const decoded = decodeSignedToken(token, deriveTokenKey(secret, "qr"));
  if (!decoded.ok) return { valid: false, reason: decoded.reason };

  // The signature only proves *we* minted this body, not that its shape is sound
  // — validate the claims before trusting `exp`/`sub` (see schema note above).
  const parsed = qrTokenPayloadSchema.safeParse(decoded.payload);
  if (!parsed.success) return { valid: false, reason: "malformed" };
  const payload: QrTokenPayload = parsed.data;

  const nowSeconds = Math.floor(clock.now().getTime() / 1000);
  if (nowSeconds > payload.exp + graceSeconds) {
    return { valid: false, reason: "expired" };
  }

  return { valid: true, customerId: payload.sub, jti: payload.jti };
}
