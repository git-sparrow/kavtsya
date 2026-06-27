import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Clock } from "./clock";

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

export type QrTokenValidation =
  | { valid: true; customerId: string; jti: string }
  | { valid: false; reason: "malformed" | "bad_signature" | "expired" };

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sign(body: string, secret: string): string {
  return base64url(createHmac("sha256", secret).update(body).digest());
}

export function signQrToken(
  customerId: string,
  { clock, secret, ttlSeconds }: SignQrTokenOptions,
): SignedQrToken {
  const iat = Math.floor(clock.now().getTime() / 1000);
  const exp = iat + ttlSeconds;
  const jti = randomUUID();
  const payload: QrTokenPayload = { sub: customerId, jti, iat, exp };

  const body = base64url(Buffer.from(JSON.stringify(payload)));
  const token = `${body}.${sign(body, secret)}`;

  return { token, jti, expiresAt: new Date(exp * 1000) };
}

export function validateQrToken(
  token: string,
  { clock, secret, graceSeconds }: ValidateQrTokenOptions,
): QrTokenValidation {
  const dot = token.indexOf(".");
  if (dot <= 0) return { valid: false, reason: "malformed" };

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  // Verify integrity before trusting anything in the payload (incl. `exp`).
  const expected = sign(body, secret);
  if (!timingSafeEqualStr(sig, expected)) {
    return { valid: false, reason: "bad_signature" };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return { valid: false, reason: "malformed" };
  }

  // The signature only proves *we* minted this body, not that its shape is sound
  // — validate the claims before trusting `exp`/`sub` (see schema note above).
  const parsed = qrTokenPayloadSchema.safeParse(raw);
  if (!parsed.success) return { valid: false, reason: "malformed" };
  const payload: QrTokenPayload = parsed.data;

  const nowSeconds = Math.floor(clock.now().getTime() / 1000);
  if (nowSeconds > payload.exp + graceSeconds) {
    return { valid: false, reason: "expired" };
  }

  return { valid: true, customerId: payload.sub, jti: payload.jti };
}

/** Constant-time string compare that tolerates length mismatch without throwing. */
function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
