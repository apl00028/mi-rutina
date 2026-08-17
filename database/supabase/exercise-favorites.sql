create table if not exists public.exercise_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id text not null check (char_length(trim(exercise_id)) > 0),
  created_at timestamptz not null default now(),

  primary key (user_id, exercise_id)
);

create index if not exists exercise_favorites_user_id_idx
  on public.exercise_favorites(user_id);

alter table public.exercise_favorites enable row level security;

drop policy if exists "Users can read their own exercise favorites"
  on public.exercise_favorites;
create policy "Users can read their own exercise favorites"
  on public.exercise_favorites
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own exercise favorites"
  on public.exercise_favorites;
create policy "Users can create their own exercise favorites"
  on public.exercise_favorites
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own exercise favorites"
  on public.exercise_favorites;
create policy "Users can delete their own exercise favorites"
  on public.exercise_favorites
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
