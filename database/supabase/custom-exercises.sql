create table if not exists public.custom_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null check (char_length(trim(name)) between 1 and 160),
  muscle text not null check (char_length(trim(muscle)) between 1 and 80),
  equipment text not null check (char_length(trim(equipment)) between 1 and 80),
  type text not null check (char_length(trim(type)) between 1 and 80),
  notes text not null default '' check (char_length(notes) <= 1000),
  category text not null check (char_length(trim(category)) between 1 and 80),
  record_types text[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists custom_exercises_user_id_idx
  on public.custom_exercises(user_id);

alter table public.custom_exercises enable row level security;

drop policy if exists "Users can read their own custom exercises"
  on public.custom_exercises;
create policy "Users can read their own custom exercises"
  on public.custom_exercises
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own custom exercises"
  on public.custom_exercises;
create policy "Users can create their own custom exercises"
  on public.custom_exercises
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own custom exercises"
  on public.custom_exercises;
create policy "Users can update their own custom exercises"
  on public.custom_exercises
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own custom exercises"
  on public.custom_exercises;
create policy "Users can delete their own custom exercises"
  on public.custom_exercises
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
