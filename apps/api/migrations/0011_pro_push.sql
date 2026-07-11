-- 0011_pro_push: Plan, push consent, token lifecycle, campaign ledger (#24, ADR 0011).
--
-- 1. `cafes.plan` — the per-Café Plan (per-Café pricing, ADR 0011). Changes
--    only by the Platform's hand in v1 (direct SQL; billing deliberately
--    deferred). Read at exactly one boundary: the requires-Pro guard on
--    campaign endpoints — the loyalty loop never sees it.
--
-- 2. `user.push_consent` — the Customer-level explicit opt-in to café news,
--    default OFF. Checked server-side at fan-out: consent off means excluded,
--    whatever tokens exist. (Per-café muting is a schema-compatible
--    fast-follow — see #24's trigger commitment.)
--
-- 3. `push_tokens` — one row per device token, full lifecycle: registered by
--    an authenticated upsert, deactivated when Expo's receipts report the
--    device gone (`DeviceNotRegistered`) so the platform's sender reputation
--    survives its cafés. `unique (token)` makes registration idempotent and
--    lets a handed-over device re-home to its new account.
--
-- 4. `campaigns` — the append-only campaign ledger (ADR 0010 habit): who sent
--    what, where, when, to how many. The 1/café/Kyiv-day cap is derived by
--    counting today's rows (same ledger-derived pattern as #21's ceiling);
--    the ceiling itself is Platform-tunable via `platform_config`.
--
-- 5. `push_tickets` — Expo ticket ids per (campaign, token), the handle the
--    receipts-pruning script resolves ~15 min after a send. `resolved_at`
--    makes the script idempotent and the backlog query cheap.
--
-- References without ON DELETE CASCADE throughout (ADR 0014).

alter table cafes
  add column "plan" text not null default 'free'
    check ("plan" in ('free', 'pro'));

alter table "user"
  add column "push_consent" boolean not null default false;

create table push_tokens (
  "id" uuid primary key default gen_random_uuid(),
  "user_id" text not null references "user" ("id"),
  "device_id" text not null,
  "token" text not null unique,
  "active" boolean not null default true,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

-- Fan-out reads one user's active tokens; the refresh path deactivates a
-- device's replaced tokens.
create index push_tokens_user_idx on push_tokens ("user_id", "active");

create table campaigns (
  "id" uuid primary key default gen_random_uuid(),
  "cafe_id" uuid not null references cafes ("id"),
  "sent_by_user_id" text not null references "user" ("id"),
  "message" text not null,
  "recipient_count" integer not null check ("recipient_count" >= 0),
  "created_at" timestamptz not null default now()
);

-- The daily-cap count slices by café and day.
create index campaigns_cafe_idx on campaigns ("cafe_id", "created_at");

create table push_tickets (
  "id" uuid primary key default gen_random_uuid(),
  "campaign_id" uuid not null references campaigns ("id"),
  "push_token_id" uuid not null references push_tokens ("id"),
  "ticket_id" text not null,
  "resolved_at" timestamptz,
  "created_at" timestamptz not null default now()
);

-- The receipts script reads the unresolved backlog.
create index push_tickets_unresolved_idx
  on push_tickets ("created_at")
  where "resolved_at" is null;

insert into platform_config ("key", "value") values (
  'campaigns',
  '{ "dailyLimit": 1 }'::jsonb
);
