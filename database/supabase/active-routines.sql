-- Bootstrap schema for new installations.
-- Existing installations must use active-routines-by-discipline.sql followed by
-- active-routines-discipline-integrity.sql; this file never drops stored data.

create table if not exists public.active_routines (
  user_id uuid not null references auth.users(id) on delete cascade,
  discipline text not null default 'strength'
    check (discipline in ('strength', 'swimming', 'cycling', 'running')),
  routine_id text not null,
  activated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, discipline),
  constraint active_routines_routine_fk
    foreign key (user_id, routine_id, discipline)
    references public.routines(user_id, id, discipline)
    on delete cascade
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
