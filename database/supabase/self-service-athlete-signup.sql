begin;

alter table public.gymos_users
  drop constraint if exists gymos_users_plan_check;

alter table public.gymos_users
  add constraint gymos_users_plan_check
  check (plan in ('free', 'trial', 'basic', 'pro'))
  not valid;

alter table public.gymos_users
  validate constraint gymos_users_plan_check;

alter table public.gymos_users
  enable row level security;

grant select, insert on public.gymos_users
  to authenticated;

drop policy if exists gymos_users_insert_own_pending
  on public.gymos_users;

drop policy if exists gymos_users_insert_own_self_service
  on public.gymos_users;

create policy gymos_users_insert_own_self_service
  on public.gymos_users
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and role = 'user'
    and status = 'active'
    and plan = 'free'
    and expires_at is null
  );

commit;

notify pgrst, 'reload schema';
