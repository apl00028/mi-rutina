-- GymOS · Weekly nutrition plans

create table if not exists public.nutrition_plans (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,

  week_start date not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'completed')),

  data jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint nutrition_plans_user_week_unique
    unique (user_id, week_start)
);

alter table public.nutrition_plans
enable row level security;


-- SELECT

drop policy if exists
  "nutrition_plans_select_own"
on public.nutrition_plans;

create policy
  "nutrition_plans_select_own"
on public.nutrition_plans
for select
to authenticated
using (
  (select auth.uid()) = user_id
);


-- INSERT

drop policy if exists
  "nutrition_plans_insert_own"
on public.nutrition_plans;

create policy
  "nutrition_plans_insert_own"
on public.nutrition_plans
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
);


-- UPDATE

drop policy if exists
  "nutrition_plans_update_own"
on public.nutrition_plans;

create policy
  "nutrition_plans_update_own"
on public.nutrition_plans
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
);


-- DELETE

drop policy if exists
  "nutrition_plans_delete_own"
on public.nutrition_plans;

create policy
  "nutrition_plans_delete_own"
on public.nutrition_plans
for delete
to authenticated
using (
  (select auth.uid()) = user_id
);


-- Useful indexes

create index if not exists
  nutrition_plans_user_week_idx
on public.nutrition_plans (
  user_id,
  week_start desc
);

create index if not exists
  nutrition_plans_user_status_idx
on public.nutrition_plans (
  user_id,
  status
);


-- updated_at

create or replace function
  public.set_nutrition_plans_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists
  nutrition_plans_set_updated_at
on public.nutrition_plans;

create trigger
  nutrition_plans_set_updated_at
before update
on public.nutrition_plans
for each row
execute function
  public.set_nutrition_plans_updated_at();
