-- 0010_scanner_grants: «Зміна» staff scanner grants (#80, ADR 0013).
--
-- 1. `cafe_scanner_grants` — the grant itself: a café-scoped, time-boxed,
--    revocable scanner capability on the barista's own Customer account. A
--    grant is *active* when now < expires_at and revoked_at is null; the
--    time-box is the security model (a forgotten revocation self-heals at the
--    café's closing time). `invite_jti unique` is what makes an invite strictly
--    single-use: the accept and the used-invite check are the same write, so
--    two baristas racing the same photographed invite can never both win.
--
-- 2. `cafe_shift_invites` — the short-lived (~10 min) invite the owner shows.
--    The QR path is the signed token (domain-separated from the Customer QR by
--    a derived per-purpose MAC key — the #80 security amendment); this row
--    exists for the typed short-code fallback, which cannot carry a signature,
--    and it is the single home of the grant parameters the accept will apply.
--    Rows are never deleted in v1 (a few per café per day; ~40-bit codes make
--    collisions with stale rows a redraw, not a risk).
--
-- 3. `purchases.issued_by_user_id` — who physically issued the Зернятко
--    (owner or grant holder), set on every issuance path from now on; existing
--    rows stay null. Audit trail now, shift attribution later (#62) — the same
--    anticipatory move as ADR 0012's nullable POS fields.
--
-- All references are without ON DELETE CASCADE (ADR 0014: deletion tombstones,
-- never rewrites ledgers or their audit trail).

create table cafe_shift_invites (
  "jti" text primary key,
  "code" text not null unique,
  "cafe_id" uuid not null references cafes ("id"),
  "created_by" text not null references "user" ("id"),
  "expires_at" timestamptz not null,
  "grant_expires_at" timestamptz not null,
  "created_at" timestamptz not null default now()
);

create table cafe_scanner_grants (
  "id" uuid primary key default gen_random_uuid(),
  "cafe_id" uuid not null references cafes ("id"),
  "user_id" text not null references "user" ("id"),
  "invite_jti" text not null unique references cafe_shift_invites ("jti"),
  "expires_at" timestamptz not null,
  "revoked_at" timestamptz,
  "created_by" text not null references "user" ("id"),
  "created_at" timestamptz not null default now()
);

-- The scan path asks "does THIS user hold an active grant at THIS café";
-- the owner's shift list reads by café.
create index cafe_scanner_grants_user_cafe_idx
  on cafe_scanner_grants ("user_id", "cafe_id");
create index cafe_scanner_grants_cafe_idx
  on cafe_scanner_grants ("cafe_id");

alter table purchases
  add column "issued_by_user_id" text references "user" ("id");
