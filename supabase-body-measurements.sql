-- GymOS · Seguimiento corporal ampliado
-- Ejecutar una vez en Supabase SQL Editor.
-- Los registros locales antiguos de peso y cintura se migran desde la app
-- y se conservan también en el payload general durante la transición.

create table if not exists public.body_measurements (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_at date not null,
  weight_kg numeric,
  neck_cm numeric,
  chest_cm numeric,
  shoulder_girth_cm numeric,
  right_flexed_arm_cm numeric,
  left_flexed_arm_cm numeric,
  waist_cm numeric,
  hips_cm numeric,
  right_flexed_thigh_cm numeric,
  left_flexed_thigh_cm numeric,
  body_fat_percent numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id),
  constraint body_measurements_has_value check (
    weight_kg is not null or
    neck_cm is not null or
    chest_cm is not null or
    shoulder_girth_cm is not null or
    right_flexed_arm_cm is not null or
    left_flexed_arm_cm is not null or
    waist_cm is not null or
    hips_cm is not null or
    right_flexed_thigh_cm is not null or
    left_flexed_thigh_cm is not null or
    body_fat_percent is not null
  )
);

alter table public.body_measurements enable row level security;

drop policy if exists "Users can read their own body measurements" on public.body_measurements;
create policy "Users can read their own body measurements"
on public.body_measurements for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own body measurements" on public.body_measurements;
create policy "Users can insert their own body measurements"
on public.body_measurements for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own body measurements" on public.body_measurements;
create policy "Users can update their own body measurements"
on public.body_measurements for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own body measurements" on public.body_measurements;
create policy "Users can delete their own body measurements"
on public.body_measurements for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists body_measurements_user_date_idx
on public.body_measurements(user_id, measured_at desc);

create or replace function public.set_body_measurements_updated_at()
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

drop trigger if exists set_body_measurements_updated_at on public.body_measurements;
create trigger set_body_measurements_updated_at
before update on public.body_measurements
for each row execute function public.set_body_measurements_updated_at();
