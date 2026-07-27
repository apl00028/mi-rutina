-- GymOS v3.7.0 — Supabase multi-user foundation
-- Run this in the Supabase SQL Editor.
-- Use only the publishable/anon key in the app. Never expose service_role.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gymos_sync (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.account_deletion_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending','processing','completed','cancelled')),
  completed_at timestamptz
);

alter table public.profiles enable row level security;
alter table public.gymos_sync enable row level security;
alter table public.account_deletion_requests enable row level security;

-- Profiles
drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Users can delete their own profile" on public.profiles;
create policy "Users can delete their own profile"
on public.profiles for delete
to authenticated
using ((select auth.uid()) = id);

-- Per-user GymOS payload
drop policy if exists "Users can read their own GymOS data" on public.gymos_sync;
create policy "Users can read their own GymOS data"
on public.gymos_sync for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own GymOS data" on public.gymos_sync;
create policy "Users can insert their own GymOS data"
on public.gymos_sync for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own GymOS data" on public.gymos_sync;
create policy "Users can update their own GymOS data"
on public.gymos_sync for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own GymOS data" on public.gymos_sync;
create policy "Users can delete their own GymOS data"
on public.gymos_sync for delete
to authenticated
using ((select auth.uid()) = user_id);

-- Users may create and view only their own deletion requests.
drop policy if exists "Users can create their own deletion request" on public.account_deletion_requests;
create policy "Users can create their own deletion request"
on public.account_deletion_requests for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own deletion requests" on public.account_deletion_requests;
create policy "Users can view their own deletion requests"
on public.account_deletion_requests for select
to authenticated
using ((select auth.uid()) = user_id);

-- Automatically create a profile when a new auth user is created.
create or replace function public.handle_new_gymos_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_gymos on auth.users;
create trigger on_auth_user_created_gymos
after insert on auth.users
for each row execute procedure public.handle_new_gymos_user();

create index if not exists account_deletion_requests_user_id_idx
on public.account_deletion_requests(user_id);

create index if not exists account_deletion_requests_status_idx
on public.account_deletion_requests(status);


-- GymOS v3.8.0 secure synchronization metadata
alter table public.gymos_sync add column if not exists revision bigint not null default 0;
alter table public.gymos_sync add column if not exists device_id text;
alter table public.gymos_sync add column if not exists checksum text;
create index if not exists gymos_sync_updated_at_idx on public.gymos_sync(updated_at desc);

create table if not exists public.sync_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text,
  action text not null,
  status text not null,
  revision bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.sync_audit enable row level security;
drop policy if exists "Users can view their own sync audit" on public.sync_audit;
create policy "Users can view their own sync audit" on public.sync_audit for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert their own sync audit" on public.sync_audit;
create policy "Users can insert their own sync audit" on public.sync_audit for insert to authenticated with check ((select auth.uid()) = user_id);
create index if not exists sync_audit_user_created_idx on public.sync_audit(user_id,created_at desc);
