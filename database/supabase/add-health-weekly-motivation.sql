alter table public.health_weekly_checkins
add column if not exists motivation smallint
check (
  motivation is null
  or motivation between 1 and 5
);
