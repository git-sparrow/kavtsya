\set ON_ERROR_STOP on
begin;
do $$
begin
  if not exists (select 1 from schema_migrations) then
    raise exception 'No migration history';
  end if;
  if exists (select 1 from pg_constraint where contype = 'f' and not convalidated) then
    raise exception 'Unvalidated foreign key';
  end if;
  if exists (
    select 1 from (
      select cafe_id, customer_user_id, count(*) as amount
      from purchases group by cafe_id, customer_user_id
      union all
      select cafe_id, customer_user_id, -sum(beans_spent) as amount
      from redemptions group by cafe_id, customer_user_id
    ) ledger group by cafe_id, customer_user_id having sum(amount) < 0
  ) then
    raise exception 'Negative derived balance';
  end if;
  if exists (
    select cafe_id, customer_user_id from purchases
    union select cafe_id, customer_user_id from redemptions
    except select cafe_id, customer_user_id from cafe_memberships
  ) then
    raise exception 'Ledger entry without membership';
  end if;
end $$;
select count(*) as users from "user";
select count(*) as cafes from cafes;
select count(*) as purchases from purchases;
select count(*) as redemptions from redemptions;
rollback;
