create table if not exists public.health_weight_entries (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    measurement_date date not null,
    weight_kg numeric(5,2) not null
        check (weight_kg >= 20 and weight_kg <= 350),
    body_fat_percent numeric(5,2) null
        check (
            body_fat_percent >= 0
            and body_fat_percent <= 100
        ),
    source text not null default 'manual'
        check (source in ('manual', 'imported', 'scale')),
    notes text null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, measurement_date)
);

create table if not exists public.health_weekly_checkins (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    week_start date not null
        check (extract(isodow from week_start) = 1),
    fatigue smallint null check (fatigue between 1 and 5),
    hunger smallint null check (hunger between 1 and 5),
    recovery smallint null check (recovery between 1 and 5),
    diet_adherence_percent numeric(5,2) null
        check (
            diet_adherence_percent >= 0
            and diet_adherence_percent <= 100
        ),
    notes text null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, week_start)
);

create index if not exists
health_weight_entries_user_date_idx
on public.health_weight_entries (
    user_id,
    measurement_date desc
);

create index if not exists
health_weekly_checkins_user_week_idx
on public.health_weekly_checkins (
    user_id,
    week_start desc
);

alter table public.health_weight_entries
enable row level security;

alter table public.health_weekly_checkins
enable row level security;

create policy health_weight_entries_select_own
on public.health_weight_entries
for select
to authenticated
using (auth.uid() = user_id);

create policy health_weight_entries_insert_own
on public.health_weight_entries
for insert
to authenticated
with check (auth.uid() = user_id);

create policy health_weight_entries_update_own
on public.health_weight_entries
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy health_weight_entries_delete_own
on public.health_weight_entries
for delete
to authenticated
using (auth.uid() = user_id);

create policy health_weekly_checkins_select_own
on public.health_weekly_checkins
for select
to authenticated
using (auth.uid() = user_id);

create policy health_weekly_checkins_insert_own
on public.health_weekly_checkins
for insert
to authenticated
with check (auth.uid() = user_id);

create policy health_weekly_checkins_update_own
on public.health_weekly_checkins
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy health_weekly_checkins_delete_own
on public.health_weekly_checkins
for delete
to authenticated
using (auth.uid() = user_id);

create or replace function
public.set_health_tracking_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists
health_weight_entries_set_updated_at
on public.health_weight_entries;

create trigger health_weight_entries_set_updated_at
before update on public.health_weight_entries
for each row
execute function public.set_health_tracking_updated_at();

drop trigger if exists
health_weekly_checkins_set_updated_at
on public.health_weekly_checkins;

create trigger health_weekly_checkins_set_updated_at
before update on public.health_weekly_checkins
for each row
execute function public.set_health_tracking_updated_at();
