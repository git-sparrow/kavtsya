import type { Cafe, Plan, Role } from "@kavtsya/shared";
import { planSchema } from "@kavtsya/shared";
import type { Database } from "./db";
import { isUniqueViolation } from "./db";
import { generateMemberCode } from "./member-code";

/**
 * Café persistence + the derived CafeOwner role (ADR 0003). The `cafe_owner`
 * role isn't a stored flag — it's derived from owning at least one Café, so the
 * ownership row is the single source of truth (and the same row the
 * self-farming guard reads later).
 */

/**
 * Register a Café owned by the given account. Every Café is born Free (#24) with
 * a printed poster join-code (#97, ADR 0013) — the same 8-char Crockford base32
 * shape as the member code, minted here with the same redraw-on-collision loop.
 */
export async function createCafe(
  db: Database,
  ownerUserId: string,
  name: string,
): Promise<Cafe> {
  for (;;) {
    try {
      const [row] = await db<{ id: string; name: string; plan: string }[]>`
        insert into cafes ("owner_user_id", "name", "poster_code")
        values (${ownerUserId}, ${name}, ${generateMemberCode()})
        returning "id", "name", "plan"
      `;
      if (!row) throw new Error("insert into cafes returned no row");
      return { id: row.id, name: row.name, plan: planSchema.parse(row.plan) };
    } catch (err) {
      // Another Café already holds this poster code — redraw (~40 bits, so this
      // practically never happens).
      if (!isUniqueViolation(err)) throw err;
    }
  }
}

/** The Cafés an account owns, oldest first. `plan` rides along (#24). */
export async function listCafesByOwner(
  db: Database,
  ownerUserId: string,
): Promise<Cafe[]> {
  const rows = await db<{ id: string; name: string; plan: string }[]>`
    select "id", "name", "plan"
    from cafes
    where "owner_user_id" = ${ownerUserId}
    order by "created_at" asc
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    plan: planSchema.parse(r.plan),
  }));
}

/**
 * The requires-Pro guard's read (#24, ADR 0011): the Café's Plan IF the caller
 * owns it — a Café that doesn't exist and one the caller doesn't own stay
 * indistinguishable, like every ownership miss. This is the only query the
 * Plan gate needs; campaign (and later analytics, #25) endpoints share it.
 */
export async function planForOwnedCafe(
  db: Database,
  cafeId: string,
  ownerUserId: string,
): Promise<Plan | null> {
  const [row] = await db<{ plan: string }[]>`
    select "plan" from cafes
    where "id" = ${cafeId} and "owner_user_id" = ${ownerUserId}
  `;
  return row ? planSchema.parse(row.plan) : null;
}

/**
 * Derive an account's roles from its Café ownership. Every account is a
 * `customer`; owning a Café additionally makes it a `cafe_owner` (ADR 0003).
 */
export function rolesFor(cafes: readonly Cafe[]): Role[] {
  return cafes.length > 0 ? ["customer", "cafe_owner"] : ["customer"];
}
