import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Clock } from "./clock";
import {
  decodeSignedToken,
  deriveTokenKey,
  encodeSignedToken,
} from "./signed-token";

/**
 * The shift-invite token (#80, ADR 0013): the QR the CafeOwner shows when
 * opening a «Зміна», scanned by the barista's own app. Same compact signed
 * format as the Customer QR (ADR 0006) but a different token FAMILY — signed
 * under its own derived key, so neither family's token can ever verify in the
 * other's validator (the #80 security amendment). The payload shape mirrors
 * the QR family on purpose: identical shapes prove the separation is carried
 * by the cryptography, not by a strippable claim.
 *
 * Pure seam like `qr-token.ts` — no DB. Single-use and the grant parameters
 * live with the invite ROW (`cafe_shift_invites`); the token authenticates the
 * QR path to that row.
 */

const shiftInvitePayloadSchema = z.object({
  /** The Café the shift is opened at (`cafes.id`). */
  sub: z.string().min(1),
  /** Unique invite id — keys the invite row; `grants.invite_jti unique` makes it single-use. */
  jti: z.string().min(1),
  /** Issued-at, epoch seconds. */
  iat: z.number(),
  /** Expiry, epoch seconds (iat + ttl). No grace: a stale invite re-mints in one tap. */
  exp: z.number(),
});
type ShiftInvitePayload = z.infer<typeof shiftInvitePayloadSchema>;

/** ~10 minutes: enough to get the QR in front of the barista, nothing more. */
export const SHIFT_INVITE_TTL_SECONDS = 600;

export interface SignShiftInviteOptions {
  clock: Clock;
  /** The one app token secret — the invite key is derived from it per family. */
  secret: string;
}

export interface SignedShiftInvite {
  token: string;
  jti: string;
  expiresAt: Date;
}

export function signShiftInvite(
  cafeId: string,
  { clock, secret }: SignShiftInviteOptions,
): SignedShiftInvite {
  const iat = Math.floor(clock.now().getTime() / 1000);
  const exp = iat + SHIFT_INVITE_TTL_SECONDS;
  const jti = randomUUID();
  const payload: ShiftInvitePayload = { sub: cafeId, jti, iat, exp };

  const token = encodeSignedToken(
    payload,
    deriveTokenKey(secret, "shift-invite"),
  );

  return { token, jti, expiresAt: new Date(exp * 1000) };
}

/** Why an invite token failed validation — the accept route maps it to the wire. */
export type ShiftInviteInvalidReason =
  | "malformed"
  | "bad_signature"
  | "expired";

export type ShiftInviteValidation =
  | { valid: true; cafeId: string; jti: string }
  | { valid: false; reason: ShiftInviteInvalidReason };

export function validateShiftInvite(
  token: string,
  { clock, secret }: SignShiftInviteOptions,
): ShiftInviteValidation {
  const decoded = decodeSignedToken(
    token,
    deriveTokenKey(secret, "shift-invite"),
  );
  if (!decoded.ok) return { valid: false, reason: decoded.reason };

  // The signature proves we minted it; the schema proves the shape is sound
  // before `exp`/`sub` are trusted (same rule as the QR family).
  const parsed = shiftInvitePayloadSchema.safeParse(decoded.payload);
  if (!parsed.success) return { valid: false, reason: "malformed" };

  const nowSeconds = Math.floor(clock.now().getTime() / 1000);
  if (nowSeconds > parsed.data.exp) {
    return { valid: false, reason: "expired" };
  }

  return { valid: true, cafeId: parsed.data.sub, jti: parsed.data.jti };
}
