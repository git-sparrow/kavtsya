-- 0005_qr_token: Platform-tunable settings for the rotating Customer QR token
-- (ADR 0006, #19). Token lifetime and the grace window past expiry live in
-- `platform_config` — the same key/value store the default Reward set uses — so
-- the Platform can tune them without a code deploy. The scan slice (#20) adds
-- the `unique (qr_jti)` single-use constraint on the Purchase row; nothing here
-- stores tokens (they are stateless, signed, and short-lived).

insert into platform_config ("key", "value") values (
  'qr_token',
  '{ "ttlSeconds": 90, "graceSeconds": 30 }'::jsonb
);
