import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Shared HMAC plumbing for the app's signed-token families: the Customer's
 * rotating QR (ADR 0006) and the shift invite (#80, ADR 0013). Domain
 * separation is cryptographic, not stylistic (the #80 security amendment):
 * each family signs with a key DERIVED from the one shared secret and a fixed
 * per-family context string, so a signature minted in one family can never
 * verify in the other — even for an identically-shaped payload. A schema-level
 * `purpose` claim would not survive a validator that strips unknown keys; the
 * key derivation cannot be stripped.
 *
 * Expiry is deliberately NOT here — each family owns its clock rules (the QR
 * has a grace window, the invite does not).
 */

export type TokenPurpose = "qr" | "shift-invite";

/** The per-family MAC key: HMAC(secret, context). Deterministic — no storage. */
export function deriveTokenKey(secret: string, purpose: TokenPurpose): Buffer {
  return createHmac("sha256", secret).update(`kavtsya:${purpose}`).digest();
}

function sign(body: string, key: Buffer): string {
  return createHmac("sha256", key).update(body).digest("base64url");
}

/** A compact `<body>.<sig>` token: base64url JSON payload + its HMAC-SHA256. */
export function encodeSignedToken(payload: unknown, key: Buffer): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, key)}`;
}

export type DecodeSignedTokenResult =
  | { ok: true; payload: unknown }
  | { ok: false; reason: "malformed" | "bad_signature" };

/**
 * Integrity + parse only: proves *we* minted this body under this family's
 * key, and hands back the raw payload for the family's schema to validate —
 * the signature never vouches for the payload's shape.
 */
export function decodeSignedToken(
  token: string,
  key: Buffer,
): DecodeSignedTokenResult {
  const dot = token.indexOf(".");
  if (dot <= 0) return { ok: false, reason: "malformed" };

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  // Verify integrity before trusting anything in the payload (incl. `exp`).
  if (!timingSafeEqualStr(sig, sign(body, key))) {
    return { ok: false, reason: "bad_signature" };
  }

  try {
    return {
      ok: true,
      payload: JSON.parse(Buffer.from(body, "base64url").toString()),
    };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

/** Constant-time string compare that tolerates length mismatch without throwing. */
function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
