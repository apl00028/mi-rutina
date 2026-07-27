-- GymOS · Valoración automática de entrenamientos
-- Ejecutar una vez en Supabase SQL Editor.

create table if not exists public.workout_analyses (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id text not null,
  overall_status text not null,
  short_title text not null,
  short_message text not null,
  structured_analysis jsonb not null default '{}'::jsonb,
  ai_message text,
  analysis_source text not null default 'rules',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id),
  unique (user_id, workout_id)
);

alter table public.workout_analyses
drop constraint if exists workout_analyses_analysis_source_check;
alter table public.workout_analyses
add constraint workout_analyses_analysis_source_check
check (analysis_source in ('rules','ai','local_fallback'));

alter table public.workout_analyses enable row level security;

drop policy if exists "Users can read their own workout analyses" on public.workout_analyses;
create policy "Users can read their own workout analyses"
on public.workout_analyses for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own workout analyses" on public.workout_analyses;
create policy "Users can insert their own workout analyses"
on public.workout_analyses for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own workout analyses" on public.workout_analyses;
create policy "Users can update their own workout analyses"
on public.workout_analyses for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own workout analyses" on public.workout_analyses;
create policy "Users can delete their own workout analyses"
on public.workout_analyses for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists workout_analyses_user_date_idx
on public.workout_analyses(user_id, created_at desc);

create or replace function public.set_workout_analyses_updated_at()
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

drop trigger if exists set_workout_analyses_updated_at on public.workout_analyses;
create trigger set_workout_analyses_updated_at
before update on public.workout_analyses
for each row execute function public.set_workout_analyses_updated_at();
