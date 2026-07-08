-- 0007_redemptions: the Redemption side of the ledger (#22, ADR 0010), plus the
-- decided ride-alongs from the 2026-07-08 decision sitting (ADR 0014, issue #57).
--
-- `redemptions` is the second append-only ledger table: one row per Reward
-- claimed. It SNAPSHOTS `beans_spent` (the Café's threshold at confirm time)
-- and the Reward, so a later program change never re-prices past Redemptions.
-- `idempotency_key` is minted per confirm tap: `unique` makes a flaky retry
-- replay the original outcome instead of double-spending, while an intentional
-- second Redemption (banking) carries a fresh key.
--
-- `cafe_memberships` is one row per (Customer, Café) pair — the `FOR UPDATE`
-- lock target ADR 0010 planned: the redemption transaction locks the pair's row
-- so two concurrent confirms can't both read balance ≥ threshold and overdraw.
-- (The idempotency key does not cover this — it stops retries, not two distinct
-- concurrent confirms.) The row is created on first Purchase and backfilled
-- below; later it also homes `cached_balance` / `last_purchase_at`.
--
-- Ride-alongs (ADR 0014): `purchases.customer_user_id` loses ON DELETE CASCADE —
-- account deletion tombstones the user and must never rewrite Cafés' ledgers —
-- and `cafes.archived_at` lands for the CafeOwner-deletion flow (a later slice
-- reads it; nothing shipped in between may assume cascade semantics). The new
-- ledger tables reference without CASCADE for the same reason.

create table cafe_memberships (
  "cafe_id" uuid not null references cafes ("id"),
  "customer_user_id" text not null references "user" ("id"),
  "created_at" timestamptz not null default now(),
  primary key ("cafe_id", "customer_user_id")
);

insert into cafe_memberships ("cafe_id", "customer_user_id")
select distinct "cafe_id", "customer_user_id" from purchases;

create table redemptions (
  "id" uuid primary key default gen_random_uuid(),
  "cafe_id" uuid not null references cafes ("id"),
  "customer_user_id" text not null references "user" ("id"),
  "beans_spent" integer not null check ("beans_spent" > 0),
  "reward" jsonb not null,
  "idempotency_key" text not null unique,
  "created_at" timestamptz not null default now()
);

-- Balance derivation reads one (Customer, Café) pair, same as purchases.
create index redemptions_customer_cafe_idx
  on redemptions ("customer_user_id", "cafe_id");

alter table purchases
  drop constraint "purchases_customer_user_id_fkey",
  add constraint "purchases_customer_user_id_fkey"
    foreign key ("customer_user_id") references "user" ("id");

-- Null = active. Set when the CafeOwner deletes their account (ADR 0014):
-- hidden from Customers, no further scans, ledger kept, balances frozen.
alter table cafes add column "archived_at" timestamptz;
