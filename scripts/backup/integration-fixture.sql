insert into "user" (id, name, email, "emailVerified") values
  ('backup-owner', 'Олена Кавовар', 'owner@backup.test', true),
  ('backup-customer', 'Тарас Ґрунт', 'customer@backup.test', true);
insert into "session" (id, "expiresAt", token, "updatedAt", "ipAddress", "userAgent", "userId") values
  ('backup-active-session', now() + interval '1 day', 'backup-active-token', now(), '192.0.2.1', 'synthetic-active-agent', 'backup-customer'),
  ('backup-expired-session', now() - interval '1 day', 'backup-expired-token', now(), '192.0.2.2', 'synthetic-expired-agent', 'backup-customer');
insert into cafes (id, owner_user_id, name, poster_code) values
  ('00000000-0000-0000-0000-000000000310', 'backup-owner', 'Кав’ярня «Зернятко»', 'BCKP2026');
insert into cafe_memberships (cafe_id, customer_user_id) values
  ('00000000-0000-0000-0000-000000000310', 'backup-customer');
insert into purchases (cafe_id, customer_user_id, qr_jti, issued_by_user_id)
select '00000000-0000-0000-0000-000000000310', 'backup-customer', 'backup-qr-' || n, 'backup-owner'
from generate_series(1, 3) n;
insert into redemptions (cafe_id, customer_user_id, beans_spent, reward, idempotency_key) values
  ('00000000-0000-0000-0000-000000000310', 'backup-customer', 2,
   '{"type":"free_drink","label":"Безкоштовний напій"}', 'backup-redemption');
create table backup_sequence_probe (id bigint generated always as identity primary key, label text not null);
insert into backup_sequence_probe (label) values ('Ґанок'), ('Кава');
