-- GymOS · Planificaciones nutricionales históricas profesionales
-- Ejecutar en Supabase SQL Editor.

create table if not exists public.professional_nutrition_plans (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  plan_date date,
  professional text not null,
  source_file jsonb not null default '{}'::jsonb,
  source_file_data text,
  meals jsonb not null default '[]'::jsonb,
  saved_adaptations jsonb not null default '[]'::jsonb,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.professional_nutrition_plans enable row level security;

drop policy if exists "professional_nutrition_select_own" on public.professional_nutrition_plans;
create policy "professional_nutrition_select_own"
on public.professional_nutrition_plans for select
using ((select auth.uid()) = user_id);

drop policy if exists "professional_nutrition_insert_own" on public.professional_nutrition_plans;
create policy "professional_nutrition_insert_own"
on public.professional_nutrition_plans for insert
with check ((select auth.uid()) = user_id);

drop policy if exists "professional_nutrition_update_own" on public.professional_nutrition_plans;
create policy "professional_nutrition_update_own"
on public.professional_nutrition_plans for update
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "professional_nutrition_delete_own" on public.professional_nutrition_plans;
create policy "professional_nutrition_delete_own"
on public.professional_nutrition_plans for delete
using ((select auth.uid()) = user_id);

create index if not exists professional_nutrition_user_date_idx
on public.professional_nutrition_plans (user_id, plan_date desc);

create or replace function public.set_professional_nutrition_updated_at()
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

drop trigger if exists professional_nutrition_set_updated_at on public.professional_nutrition_plans;
create trigger professional_nutrition_set_updated_at
before update on public.professional_nutrition_plans
for each row execute function public.set_professional_nutrition_updated_at();
