select
  m."cafe_id",
  m."customer_user_id",
  coalesce(p."purchases", 0) as purchases,
  coalesce(r."beans_spent", 0) as beans_spent
from cafe_memberships m
left join (
  select "cafe_id", "customer_user_id", count(*)::int as purchases
  from purchases group by "cafe_id", "customer_user_id"
) p on p."cafe_id" = m."cafe_id"
  and p."customer_user_id" = m."customer_user_id"
left join (
  select "cafe_id", "customer_user_id", sum("beans_spent")::int as beans_spent
  from redemptions group by "cafe_id", "customer_user_id"
) r on r."cafe_id" = m."cafe_id"
  and r."customer_user_id" = m."customer_user_id"
-- Mirrors deriveBalance (count(purchases) − sum(beans_spent)) in SQL: a
-- filter can't call the JS helper, but the returned balance still does.
where coalesce(p."purchases", 0) - coalesce(r."beans_spent", 0) < 0
