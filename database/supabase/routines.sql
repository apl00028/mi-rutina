create table if not exists public.routines (
  id text not null check (char_length(trim(id)) > 0),
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, id)
);

create index if not exists routines_user_updated_at_idx
  on public.routines(user_id, updated_at desc);

alter table public.routines enable row level security;

drop policy if exists "Users can read their own routines"
  on public.routines;
create policy "Users can read their own routines"
  on public.routines
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own routines"
  on public.routines;
create policy "Users can create their own routines"
  on public.routines
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own routines"
  on public.routines;
create policy "Users can update their own routines"
  on public.routines
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own routines"
  on public.routines;

create policy "Users can delete their own routines"
  on public.routines
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);