-- Aptus · Minimal owner-scoped Goal lifecycle.

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references auth.users(id) on delete cascade,
  category text not null,
  kind text not null,
  variant text null,
  target_date date null,
  status text not null default 'active',
  created_by_user_id uuid null
    references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint goals_status_check
    check (status in ('active', 'completed', 'abandoned')),

  constraint goals_category_kind_check
    check (
      (category = 'health'
        and kind in ('general_health', 'more_active'))
      or (category = 'body_composition'
        and kind in ('fat_loss', 'recomposition'))
      or (category = 'strength'
        and kind in (
          'muscle_gain',
          'strength_gain',
          'return_to_training'
        ))
      or (category = 'endurance'
        and kind in (
          'running',
          'swimming',
          'cycling',
          'triathlon',
          'duathlon'
        ))
      or (category = 'sport_performance'
        and kind = 'sport_performance')
    ),

  constraint goals_variant_check
    check (
      variant is null
      or (kind = 'running'
        and variant in ('5k', '10k', 'half_marathon'))
      or (kind = 'triathlon'
        and variant in ('sprint', 'olympic'))
    )
);


create unique index if not exists
  goals_one_active_per_user_idx
on public.goals (user_id)
where status = 'active';

create index if not exists
  goals_user_created_at_idx
on public.goals (user_id, created_at desc);


alter table public.goals
  enable row level security;

drop policy if exists goals_select_own
  on public.goals;
create policy goals_select_own
  on public.goals
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.gymos_users
      where gymos_users.user_id = (select auth.uid())
        and gymos_users.status = 'active'
        and gymos_users.role in ('user', 'admin')
    )
  );

drop policy if exists goals_insert_own
  on public.goals;
create policy goals_insert_own
  on public.goals
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select auth.uid()) = created_by_user_id
    and exists (
      select 1
      from public.gymos_users
      where gymos_users.user_id = (select auth.uid())
        and gymos_users.status = 'active'
        and gymos_users.role in ('user', 'admin')
    )
  );

drop policy if exists goals_update_own
  on public.goals;
create policy goals_update_own
  on public.goals
  for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.gymos_users
      where gymos_users.user_id = (select auth.uid())
        and gymos_users.status = 'active'
        and gymos_users.role in ('user', 'admin')
    )
  )
  with check (
    (select auth.uid()) = user_id
    and (select auth.uid()) = created_by_user_id
    and exists (
      select 1
      from public.gymos_users
      where gymos_users.user_id = (select auth.uid())
        and gymos_users.status = 'active'
        and gymos_users.role in ('user', 'admin')
    )
  );


revoke all on public.goals from anon;
revoke all on public.goals from authenticated;
grant select, insert, update on public.goals to authenticated;


create or replace function
  public.set_goals_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists goals_set_updated_at
  on public.goals;
create trigger goals_set_updated_at
before update on public.goals
for each row
execute function public.set_goals_updated_at();


-- Goal metrics keep canonical numeric values. Units are derived from the
-- backend registry and cannot drift between rows for the same metric key.
create table if not exists public.goal_metrics (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null
    references public.goals(id) on delete cascade,
  metric_key text not null,
  target_value numeric null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint goal_metrics_goal_key_unique
    unique (goal_id, metric_key),
  constraint goal_metrics_key_check check (
    metric_key in (
      'body_weight',
      'waist_circumference',
      'continuous_swim_distance',
      'continuous_run_distance',
      'cycling_distance'
    )
  ),
  constraint goal_metrics_target_check check (
    target_value is null
    or (metric_key = 'body_weight'
      and target_value between 20 and 350)
    or (metric_key = 'waist_circumference'
      and target_value between 30 and 250)
    or (metric_key in (
        'continuous_swim_distance',
        'continuous_run_distance',
        'cycling_distance'
      ) and target_value between 1 and 1000000)
  )
);

create index if not exists goal_metrics_goal_idx
  on public.goal_metrics(goal_id, created_at);


create table if not exists public.goal_metric_baselines (
  id uuid primary key default gen_random_uuid(),
  goal_metric_id uuid not null
    references public.goal_metrics(id) on delete cascade,
  value numeric not null,
  measured_at date not null,
  source_type text not null,
  source_domain text null,
  source_record_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint goal_metric_baselines_metric_unique
    unique (goal_metric_id),
  constraint goal_metric_baselines_source_type_check
    check (source_type in (
      'manual',
      'aptus',
      'health_connect',
      'imported',
      'derived',
      'scale'
    )),
  constraint goal_metric_baselines_source_domain_check
    check (
      source_domain is null
      or source_domain in (
        'health_weight_entries',
        'health_body_measurements',
        'health_weekly_checkins',
        'running_sessions',
        'swimming_sessions',
        'workouts'
      )
    ),
  constraint goal_metric_baselines_source_record_check
    check (
      source_record_id is null
      or (
        source_domain is not null
        and source_record_id !~ '^[[:space:]]*$'
        and length(source_record_id) <= 1024
      )
    )
);


create or replace function
  public.validate_goal_metric_baseline_value()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  stored_metric_key text;
begin
  select metric_key into stored_metric_key
  from public.goal_metrics
  where id = new.goal_metric_id;

  if not (
    (stored_metric_key = 'body_weight'
      and new.value between 20 and 350)
    or (stored_metric_key = 'waist_circumference'
      and new.value between 30 and 250)
    or (stored_metric_key in (
        'continuous_swim_distance',
        'continuous_run_distance',
        'cycling_distance'
      ) and new.value between 1 and 1000000)
  ) then
    raise exception 'Invalid Goal metric baseline value'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists goal_metric_baseline_value_check
  on public.goal_metric_baselines;
create trigger goal_metric_baseline_value_check
before insert or update on public.goal_metric_baselines
for each row execute function
  public.validate_goal_metric_baseline_value();


drop trigger if exists goal_metrics_set_updated_at
  on public.goal_metrics;
create trigger goal_metrics_set_updated_at
before update on public.goal_metrics
for each row execute function public.set_goals_updated_at();

drop trigger if exists goal_metric_baselines_set_updated_at
  on public.goal_metric_baselines;
create trigger goal_metric_baselines_set_updated_at
before update on public.goal_metric_baselines
for each row execute function public.set_goals_updated_at();


alter table public.goal_metrics enable row level security;
alter table public.goal_metric_baselines enable row level security;

drop policy if exists goal_metrics_select_own
  on public.goal_metrics;
create policy goal_metrics_select_own
  on public.goal_metrics for select to authenticated
  using (
    exists (
      select 1 from public.goals
      join public.gymos_users
        on gymos_users.user_id = goals.user_id
      where goals.id = goal_metrics.goal_id
        and goals.user_id = (select auth.uid())
        and gymos_users.status = 'active'
        and gymos_users.role in ('user', 'admin')
    )
  );

drop policy if exists goal_metrics_insert_own
  on public.goal_metrics;
create policy goal_metrics_insert_own
  on public.goal_metrics for insert to authenticated
  with check (
    exists (
      select 1 from public.goals
      join public.gymos_users
        on gymos_users.user_id = goals.user_id
      where goals.id = goal_metrics.goal_id
        and goals.user_id = (select auth.uid())
        and gymos_users.status = 'active'
        and gymos_users.role in ('user', 'admin')
    )
  );

drop policy if exists goal_metrics_update_own
  on public.goal_metrics;
create policy goal_metrics_update_own
  on public.goal_metrics for update to authenticated
  using (
    exists (
      select 1 from public.goals
      where goals.id = goal_metrics.goal_id
        and goals.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.goals
      join public.gymos_users
        on gymos_users.user_id = goals.user_id
      where goals.id = goal_metrics.goal_id
        and goals.user_id = (select auth.uid())
        and gymos_users.status = 'active'
        and gymos_users.role in ('user', 'admin')
    )
  );

drop policy if exists goal_metric_baselines_select_own
  on public.goal_metric_baselines;
create policy goal_metric_baselines_select_own
  on public.goal_metric_baselines for select to authenticated
  using (
    exists (
      select 1 from public.goal_metrics
      join public.goals on goals.id = goal_metrics.goal_id
      join public.gymos_users
        on gymos_users.user_id = goals.user_id
      where goal_metrics.id = goal_metric_baselines.goal_metric_id
        and goals.user_id = (select auth.uid())
        and gymos_users.status = 'active'
        and gymos_users.role in ('user', 'admin')
    )
  );

drop policy if exists goal_metric_baselines_insert_own
  on public.goal_metric_baselines;
create policy goal_metric_baselines_insert_own
  on public.goal_metric_baselines for insert to authenticated
  with check (
    exists (
      select 1 from public.goal_metrics
      join public.goals on goals.id = goal_metrics.goal_id
      join public.gymos_users
        on gymos_users.user_id = goals.user_id
      where goal_metrics.id = goal_metric_baselines.goal_metric_id
        and goals.user_id = (select auth.uid())
        and gymos_users.status = 'active'
        and gymos_users.role in ('user', 'admin')
    )
  );

drop policy if exists goal_metric_baselines_update_own
  on public.goal_metric_baselines;
create policy goal_metric_baselines_update_own
  on public.goal_metric_baselines for update to authenticated
  using (
    exists (
      select 1 from public.goal_metrics
      join public.goals on goals.id = goal_metrics.goal_id
      where goal_metrics.id = goal_metric_baselines.goal_metric_id
        and goals.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.goal_metrics
      join public.goals on goals.id = goal_metrics.goal_id
      join public.gymos_users
        on gymos_users.user_id = goals.user_id
      where goal_metrics.id = goal_metric_baselines.goal_metric_id
        and goals.user_id = (select auth.uid())
        and gymos_users.status = 'active'
        and gymos_users.role in ('user', 'admin')
    )
  );


revoke all on public.goal_metrics from anon, authenticated;
revoke all on public.goal_metric_baselines from anon, authenticated;
grant select, insert, update on public.goal_metrics to authenticated;
grant select, insert, update on public.goal_metric_baselines
  to authenticated;
