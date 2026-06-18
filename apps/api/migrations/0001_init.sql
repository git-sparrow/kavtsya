-- 0001_init: foundational extensions.
-- pgcrypto provides gen_random_uuid(), used for primary keys in later slices
-- (cafes, cafe_memberships, the event ledger — ADR 0010).
create extension if not exists pgcrypto;
