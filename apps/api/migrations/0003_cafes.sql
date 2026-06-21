-- 0003_cafes: Café registration + the owner↔Café ownership link (#17).
--
-- A Café is registered as part of CafeOwner signup (ADR 0003 — one account
-- holds both Customer and CafeOwner roles). The CafeOwner role is *derived*
-- from ownership: an account is a CafeOwner iff it owns at least one Café, so
-- there is no separate mutable role flag to keep in sync. `owner_user_id` is
-- the same link the self-farming guard reads later (ADR 0003): issuance and
-- Redemption are rejected when the acting Customer owns the Café.
--
-- `owner_user_id` references Better Auth's "user" table (text ids). No unique
-- constraint on the owner: the schema already permits the multi-Café-per-owner
-- future (ADR 0003); v1 onboarding registers one.

create table cafes (
  "id" uuid primary key default gen_random_uuid(),
  "owner_user_id" text not null references "user" ("id") on delete cascade,
  "name" text not null,
  "created_at" timestamptz not null default now()
);

create index cafes_owner_user_id_idx on cafes ("owner_user_id");
