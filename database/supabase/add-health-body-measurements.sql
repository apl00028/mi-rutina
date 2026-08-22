create table if not exists public.health_body_measurements (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  measurement_date date not null,

  waist_cm numeric(5,2)
    check (
      waist_cm is null
      or waist_cm between 30 and 250
    ),

  abdomen_cm numeric(5,2)
    check (
      abdomen_cm is null
      or abdomen_cm between 30 and 250
    ),

  chest_cm numeric(5,2)
    check (
      chest_cm is null
      or chest_cm between 30 and 250
    ),

  shoulders_cm numeric(5,2)
    check (
      shoulders_cm is null
      or shoulders_cm between 30 and 250
    ),

  neck_cm numeric(5,2)
    check (
      neck_cm is null
      or neck_cm between 20 and 100
    ),

  left_arm_cm numeric(5,2)
    check (
      left_arm_cm is null
      or left_arm_cm between 10 and 100
    ),

  right_arm_cm numeric(5,2)
    check (
      right_arm_cm is null
      or right_arm_cm between 10 and 100
    ),

  left_thigh_cm numeric(5,2)
    check (
      left_thigh_cm is null
      or left_thigh_cm between 20 and 150
    ),

  right_thigh_cm numeric(5,2)
    check (
      right_thigh_cm is null
      or right_thigh_cm between 20 and 150
    ),

  notes text,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  unique (user_id, measurement_date)
);

create index if not exists
  health_body_measurements_user_date_idx
on public.health_body_measurements(
  user_id,
  measurement_date desc
);

alter table public.health_body_measurements
enable row level security;

create policy "health_body_measurements_select_own"
on public.health_body_measurements
for select
to authenticated
using (auth.uid() = user_id);

create policy "health_body_measurements_insert_own"
on public.health_body_measurements
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "health_body_measurements_update_own"
on public.health_body_measurements
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "health_body_measurements_delete_own"
on public.health_body_measurements
for delete
to authenticated
using (auth.uid() = user_id);
