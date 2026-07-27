-- 0017_account_deletion: the tombstone column, and the last two cascades die
-- (#81, ADR 0014).
--
-- 1. `"user"."deleted_at"` is the tombstone: null = a live account, set = the
--    row survives only so `purchases`/`redemptions` keep pointing somewhere.
--    Deletion is an UPDATE — the user row is NEVER deleted, because deleting it
--    would rewrite every Café's history and every other Customer's balance.
--    It doubles as the idempotency guard (a second delete finds it already set)
--    and as the "this session cannot act" flag any surviving request path reads.
--
-- 2. ADR 0014 dropped `purchases.customer_user_id`'s cascade with #22, but the
--    same chain still existed one hop out: `cafes.owner_user_id` cascaded from
--    "user", and `purchases.cafe_id` cascaded from `cafes` — so a single
--    `delete from "user"` would still have taken a Café down and wiped the whole
--    café's ledger with it, every other Customer's Зернятка included. Both go
--    now (mandatory, decided at the 2026-07-10 grilling): with no cascade path
--    left, the database itself refuses the destructive shape, so the invariant
--    survives a contributor who never read the ticket rather than resting on
--    discipline. Café "deletion" is always `archived_at`.
--
--    Better Auth's own `session`/`account` cascades stay: those rows ARE deleted
--    deliberately during the scrub, and they hold no ledger.

alter table "user" add column "deleted_at" timestamptz;

alter table cafes
  drop constraint "cafes_owner_user_id_fkey",
  add constraint "cafes_owner_user_id_fkey"
    foreign key ("owner_user_id") references "user" ("id");

alter table purchases
  drop constraint "purchases_cafe_id_fkey",
  add constraint "purchases_cafe_id_fkey"
    foreign key ("cafe_id") references cafes ("id");
