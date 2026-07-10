import { randomInt } from "node:crypto";
import {
  MEMBER_CODE_ALPHABET,
  MEMBER_CODE_LENGTH,
  normalizeMemberCode,
} from "@kavtsya/shared";
import type { Database } from "./db";
import { isUniqueViolation } from "./db";

/**
 * The Customer's member code (#21, ADR 0006): the stable offline fallback for
 * the rotating QR. Minted lazily on the first `GET /api/me/member-code` and
 * never rotated — the app caches it on the device, so it must stay valid for
 * the account's lifetime. Rotation ("my code leaked") is a support action,
 * not v1 surface.
 */

/** A fresh random code: 8 Crockford base32 chars, ~40 bits of entropy. */
export function generateMemberCode(): string {
  let code = "";
  for (let i = 0; i < MEMBER_CODE_LENGTH; i++) {
    code += MEMBER_CODE_ALPHABET[randomInt(MEMBER_CODE_ALPHABET.length)]!;
  }
  return code;
}

/**
 * The Customer's member code, minting one on first read. Concurrency-safe
 * without a transaction: the guarded update only fills a null column, so a
 * double-tap's loser observes the winner's code; a collision with *another*
 * Customer's code trips the unique constraint and simply redraws (at ~40 bits
 * this practically never happens). Null only when the user row is gone.
 */
export async function getOrCreateMemberCode(
  db: Database,
  userId: string,
): Promise<string | null> {
  for (;;) {
    const [row] = await db<{ member_code: string | null }[]>`
      select "member_code" from "user" where "id" = ${userId}
    `;
    if (!row) return null;
    if (row.member_code) return row.member_code;

    try {
      const [minted] = await db<{ member_code: string }[]>`
        update "user" set "member_code" = ${generateMemberCode()}
        where "id" = ${userId} and "member_code" is null
        returning "member_code"
      `;
      if (minted) return minted.member_code;
      // Zero rows: a concurrent request won the mint — loop re-reads theirs.
    } catch (err) {
      // Another Customer already holds this code — redraw.
      if (!isUniqueViolation(err)) throw err;
    }
  }
}

/**
 * The Customer a typed member code identifies, or null when no one holds it.
 * The counterpart of `validateQrToken` on the manual path (#21): the route
 * resolves the identifier first, then issuing proceeds identically. Input is
 * normalized (case, separators, confusables) before lookup, so fast counter
 * typing still lands.
 */
export async function customerIdForMemberCode(
  db: Database,
  typedCode: string,
): Promise<string | null> {
  const [row] = await db<{ id: string }[]>`
    select "id" from "user" where "member_code" = ${normalizeMemberCode(typedCode)}
  `;
  return row?.id ?? null;
}
