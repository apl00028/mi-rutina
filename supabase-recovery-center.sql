-- GymOS · Recuperación
-- Ejecutar en Supabase SQL Editor para habilitar sincronización entre dispositivos.

create table if not exists public.daily_recovery (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_key text not null,
  date date not null,
  sleep_hours numeric(3,1) check (sleep_hours >= 0 and sleep_hours <= 24),
  sleep_quality smallint not null check (sleep_quality between 1 and 5),
  energy smallint not null check (energy between 1 and 5),
  fatigue smallint not null check (fatigue between 0 and 4),
  stress smallint not null check (stress between 1 and 5),
  motivation smallint not null default 3 check (motivation between 1 and 5),
  pain_level smallint not null check (pain_level between 0 and 4),
  pain_location text[] not null default '{}',
  recovery_score smallint not null check (recovery_score between 0 and 100),
  coach_message text not null default '',
  notes text not null default '',
  workout_id text,
  checkin_id text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_key)
);

alter table public.daily_recovery add column if not exists entry_key text;
alter table public.daily_recovery add column if not exists workout_id text;
alter table public.daily_recovery add column if not exists checkin_id text;
alter table public.daily_recovery alter column sleep_hours drop not null;
alter table public.daily_recovery add column if not exists motivation smallint not null default 3;
alter table public.daily_recovery add column if not exists notes text not null default '';
alter table public.daily_recovery add column if not exists routine_id text;
alter table public.daily_recovery add column if not exists session_id text;
alter table public.daily_recovery add column if not exists session_name text;
alter table public.daily_recovery add column if not exists result jsonb;
alter table public.daily_recovery drop constraint if exists daily_recovery_pain_level_check;
alter table public.daily_recovery add constraint daily_recovery_pain_level_check
check (pain_level between 0 and 4);
update public.daily_recovery
set entry_key = coalesce(nullif(checkin_id,''),'date:' || date::text)
where entry_key is null or entry_key = '';
alter table public.daily_recovery alter column entry_key set not null;
alter table public.daily_recovery drop constraint if exists daily_recovery_user_id_date_key;
create unique index if not exists daily_recovery_user_entry_key_idx
on public.daily_recovery (user_id, entry_key);
alter table public.daily_recovery enable row level security;

drop policy if exists "daily_recovery_select_own" on public.daily_recovery;
create policy "daily_recovery_select_own"
on public.daily_recovery for select
using ((select auth.uid()) = user_id);

drop policy if exists "daily_recovery_insert_own" on public.daily_recovery;
create policy "daily_recovery_insert_own"
on public.daily_recovery for insert
with check ((select auth.uid()) = user_id);

drop policy if exists "daily_recovery_update_own" on public.daily_recovery;
create policy "daily_recovery_update_own"
on public.daily_recovery for update
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "daily_recovery_delete_own" on public.daily_recovery;
create policy "daily_recovery_delete_own"
on public.daily_recovery for delete
using ((select auth.uid()) = user_id);

create index if not exists daily_recovery_user_date_idx
on public.daily_recovery (user_id, date desc);

create or replace function public.set_daily_recovery_updated_at()
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

drop trigger if exists daily_recovery_set_updated_at on public.daily_recovery;
create trigger daily_recovery_set_updated_at
before update on public.daily_recovery
for each row execute function public.set_daily_recovery_updated_at();

create table if not exists public.recovery_checkins (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id text not null,
  workout_date timestamptz not null,
  available_from date not null,
  status text not null default 'pending' check (status in ('pending','completed')),
  session text not null default '',
  routine_id text,
  session_id text,
  session_name text,
  session_focus text,
  duration_ms bigint not null default 0 check (duration_ms >= 0),
  workout_snapshot jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, workout_id)
);

alter table public.recovery_checkins add column if not exists routine_id text;
alter table public.recovery_checkins add column if not exists session_id text;
alter table public.recovery_checkins add column if not exists session_name text;
alter table public.recovery_checkins add column if not exists session_focus text;
alter table public.recovery_checkins add column if not exists duration_ms bigint not null default 0;
alter table public.recovery_checkins add column if not exists workout_snapshot jsonb;
alter table public.recovery_checkins enable row level security;

drop policy if exists "recovery_checkins_select_own" on public.recovery_checkins;
create policy "recovery_checkins_select_own"
on public.recovery_checkins for select
using ((select auth.uid()) = user_id);

drop policy if exists "recovery_checkins_insert_own" on public.recovery_checkins;
create policy "recovery_checkins_insert_own"
on public.recovery_checkins for insert
with check ((select auth.uid()) = user_id);

drop policy if exists "recovery_checkins_update_own" on public.recovery_checkins;
create policy "recovery_checkins_update_own"
on public.recovery_checkins for update
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "recovery_checkins_delete_own" on public.recovery_checkins;
create policy "recovery_checkins_delete_own"
on public.recovery_checkins for delete
using ((select auth.uid()) = user_id);

create index if not exists recovery_checkins_due_idx
on public.recovery_checkins (user_id, status, available_from);

create or replace function public.set_recovery_checkin_updated_at()
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

drop trigger if exists recovery_checkins_set_updated_at on public.recovery_checkins;
create trigger recovery_checkins_set_updated_at
before update on public.recovery_checkins
for each row execute function public.set_recovery_checkin_updated_at();
