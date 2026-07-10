-- 0009_member_code: the offline fallback for earning (#21, ADR 0006).
--
-- 1. `member_code` on "user" — a short, stable, unique code (8 chars, Crockford
--    base32, ~40 bits) the Customer shows when their rotating QR can't be
--    scanned (offline phone, stale token, bad camera read). Nullable: minted
--    lazily by the first `GET /api/me/member-code`, not at signup.
--
-- 2. The Purchase ledger learns its entry source (`qr` | `member_code`).
--    Manual entries have no QR token, so `qr_jti` becomes nullable — the
--    single-use unique constraint still holds for QR rows (nulls don't
--    collide) — and a check ties a null jti to the manual source so neither
--    path can masquerade as the other. The ledger stays append-only (ADR 0010);
--    `entry_source` is also the hook staff attribution (#62) will use later.
--
-- 3. The manual-entry ceiling (3 issuances per Customer per Café per day) is
--    Platform-tunable without a deploy, like the QR ttl/grace (ADR 0006).

alter table "user" add column "member_code" text unique;

alter table purchases
  add column "entry_source" text not null default 'qr'
    check ("entry_source" in ('qr', 'member_code')),
  alter column "qr_jti" drop not null,
  add constraint purchases_source_jti_check
    check (("entry_source" = 'qr') = ("qr_jti" is not null));

insert into platform_config ("key", "value") values (
  'manual_entry',
  '{ "dailyLimit": 3 }'::jsonb
);
