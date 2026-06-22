import type { Cafe, Role } from "@kavtsya/shared";
import type { Database } from "./db";

/**
 * Café persistence + the derived CafeOwner role (ADR 0003). The `cafe_owner`
 * role isn't a stored flag — it's derived from owning at least one Café, so the
 * ownership row is the single source of truth (and the same row the
 * self-farming guard reads later).
 */

/** Register a Café owned by the given account. */
export async function createCafe(
  db: Database,
  ownerUserId: string,
  name: string,
): Promise<Cafe> {
  const [row] = await db<{ id: string; name: string }[]>`
    insert into cafes ("owner_user_id", "name")
    values (${ownerUserId}, ${name})
    returning "id", "name"
  `;
  if (!row) throw new Error("insert into cafes returned no row");
  return { id: row.id, name: row.name };
}

/** The Cafés an account owns, oldest first. */
export async function listCafesByOwner(
  db: Database,
  ownerUserId: string,
): Promise<Cafe[]> {
  const rows = await db<{ id: string; name: string }[]>`
    select "id", "name"
    from cafes
    where "owner_user_id" = ${ownerUserId}
    order by "created_at" asc
  `;
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

/**
 * Derive an account's roles from its Café ownership. Every account is a
 * `customer`; owning a Café additionally makes it a `cafe_owner` (ADR 0003).
 */
export function rolesFor(cafes: readonly Cafe[]): Role[] {
  return cafes.length > 0 ? ["customer", "cafe_owner"] : ["customer"];
}
