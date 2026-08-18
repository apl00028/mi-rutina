drop table if exists public.active_routines cascade;

create table public.active_routines (
  user_id uuid primary key references auth.users(id) on delete cascade,
  routine_id text not null,
  activated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint active_routines_routine_fk
    foreign key (user_id, routine_id)
    references public.routines(user_id, id)
    on delete cascade
);

alter table public.active_routines enable row level security;

create policy "Users can read their active routine"
  on public.active_routines
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can set their active routine"
  on public.active_routines
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their active routine"
  on public.active_routines
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);