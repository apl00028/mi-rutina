create table if not exists public.active_routines (
  user_id uuid primary key references auth.users(id) on delete cascade,
  routine_id text not null,
  activated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.active_routines enable row level security;

drop policy if exists "Users can read their active routine"
  on public.active_routines;

create policy "Users can read their active routine"
  on public.active_routines
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can set their active routine"
  on public.active_routines;

create policy "Users can set their active routine"
  on public.active_routines
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their active routine"
  on public.active_routines;

create policy "Users can update their active routine"
  on public.active_routines
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
  