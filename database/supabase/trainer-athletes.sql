-- Trainer-athlete relationship foundation.
-- Run this once in the Supabase SQL Editor.

do $$
begin
  if to_regclass('public.gymos_users') is not null then
    alter table public.gymos_users
      drop constraint if exists gymos_users_role_check;

    alter table public.gymos_users
      add constraint gymos_users_role_check
      check (role in ('user','trainer','admin'));
  end if;
end
$$;


create table if not exists public.trainer_athletes (
  trainer_id uuid not null
    references auth.users(id)
    on delete cascade,

  athlete_id uuid not null
    references auth.users(id)
    on delete cascade,

  status text not null
    default 'active'
    check (
      status in (
        'active',
        'inactive'
      )
    ),

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  primary key (trainer_id, athlete_id),

  constraint trainer_athletes_distinct_users_check
    check (trainer_id <> athlete_id)
);


create index if not exists
  trainer_athletes_trainer_id_idx
  on public.trainer_athletes(trainer_id);

create index if not exists
  trainer_athletes_athlete_id_idx
  on public.trainer_athletes(athlete_id);


alter table public.trainer_athletes
  enable row level security;


drop policy if exists
  "Trainers can read their athlete relationships"
  on public.trainer_athletes;

create policy
  "Trainers can read their athlete relationships"
  on public.trainer_athletes
  for select
  to authenticated
  using (
    (select auth.uid()) = trainer_id
    and exists (
      select 1
      from public.gymos_users
      where gymos_users.user_id = (select auth.uid())
        and gymos_users.role = 'trainer'
        and gymos_users.status = 'active'
    )
  );


drop policy if exists
  "Athletes can read their trainer relationships"
  on public.trainer_athletes;

create policy
  "Athletes can read their trainer relationships"
  on public.trainer_athletes
  for select
  to authenticated
  using (
    (select auth.uid()) = athlete_id
  );


drop policy if exists
  "Trainers can create athlete relationships"
  on public.trainer_athletes;
drop policy if exists
  "Trainers can update athlete relationships"
  on public.trainer_athletes;
drop policy if exists
  "Trainers can delete athlete relationships"
  on public.trainer_athletes;
drop policy if exists
  "Users can create trainer athlete relationships"
  on public.trainer_athletes;
drop policy if exists
  "Users can update trainer athlete relationships"
  on public.trainer_athletes;
drop policy if exists
  "Users can delete trainer athlete relationships"
  on public.trainer_athletes;
