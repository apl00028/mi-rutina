alter table public.health_weight_entries
  add column if not exists muscle_mass_kg numeric(5,2),
  add column if not exists body_water_percent numeric(5,2),
  add column if not exists visceral_fat_index numeric(5,2);

alter table public.health_weight_entries
  add constraint health_weight_entries_muscle_mass_kg_check
  check (
    muscle_mass_kg is null
    or (muscle_mass_kg > 0 and muscle_mass_kg <= 250)
  );

alter table public.health_weight_entries
  add constraint health_weight_entries_body_water_percent_check
  check (
    body_water_percent is null
    or (body_water_percent >= 0 and body_water_percent <= 100)
  );

alter table public.health_weight_entries
  add constraint health_weight_entries_visceral_fat_index_check
  check (
    visceral_fat_index is null
    or visceral_fat_index >= 0
  );

alter table public.health_weekly_checkins
  add column if not exists waist_cm numeric(5,2);

alter table public.health_weekly_checkins
  add constraint health_weekly_checkins_waist_cm_check
  check (
    waist_cm is null
    or (waist_cm >= 30 and waist_cm <= 250)
  );

create table if not exists public.health_daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  measurement_date date not null,

  hunger smallint
    check (hunger between 1 and 5),

  diet_adherence_percent numeric(5,2)
    check (
      diet_adherence_percent between 0 and 100
    ),

  notes text,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  unique (user_id, measurement_date)
);

create index if not exists
  health_daily_checkins_user_date_idx
on public.health_daily_checkins(
  user_id,
  measurement_date desc
);

alter table public.health_daily_checkins
enable row level security;

create policy "health_daily_checkins_select_own"
on public.health_daily_checkins
for select
to authenticated
using (auth.uid() = user_id);

create policy "health_daily_checkins_insert_own"
on public.health_daily_checkins
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "health_daily_checkins_update_own"
on public.health_daily_checkins
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "health_daily_checkins_delete_own"
on public.health_daily_checkins
for delete
to authenticated
using (auth.uid() = user_id);
