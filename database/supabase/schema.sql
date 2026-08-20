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

-- Per-user GymOS payload.
-- Direct writes are intentionally not allowed: sync head writes must go through
-- public.gymos_sync_compare_and_swap() so cached legacy clients cannot upsert
-- blindly over the canonical row.
drop policy if exists "Users can read their own GymOS data" on public.gymos_sync;
create policy "Users can read their own GymOS data"
on public.gymos_sync for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own GymOS data" on public.gymos_sync;
drop policy if exists "Users can update their own GymOS data" on public.gymos_sync;
drop policy if exists "Users can delete their own GymOS data" on public.gymos_sync;

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

revoke insert, update, delete on table public.gymos_sync from anon, authenticated;
grant select on table public.gymos_sync to authenticated;

create or replace function public.gymos_sync_compare_and_swap(
  expected_revision bigint,
  expected_checksum text,
  new_revision bigint,
  new_device_id text,
  new_checksum text,
  new_payload jsonb
)
returns table(success boolean, conflict boolean, revision bigint, checksum text)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_user_id uuid := auth.uid();
  written_revision bigint;
  written_checksum text;
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if expected_revision is null or expected_revision < 0 then
    raise exception 'sync_protocol_error' using errcode = '22023';
  end if;

  if new_revision is null or new_revision <> expected_revision + 1 then
    raise exception 'sync_protocol_error' using errcode = '22023';
  end if;

  if new_payload is null then
    raise exception 'sync_protocol_error' using errcode = '22023';
  end if;

  if expected_revision = 0 then
    if new_revision <> 1 or expected_checksum is not null then
      raise exception 'sync_protocol_error' using errcode = '22023';
    end if;

    insert into public.gymos_sync as sync_row (
      user_id, payload, revision, device_id, checksum, updated_at
    )
    values (
      current_user_id, new_payload, new_revision, new_device_id, new_checksum, pg_catalog.now()
    )
    on conflict (user_id) do nothing
    returning sync_row.revision, sync_row.checksum
    into written_revision, written_checksum;

    if found then
      return query select true, false, written_revision, written_checksum;
      return;
    end if;

    select sync_row.revision, sync_row.checksum
    into written_revision, written_checksum
    from public.gymos_sync as sync_row
    where sync_row.user_id = current_user_id;

    return query select false, true, written_revision, written_checksum;
    return;
  end if;

  if expected_checksum is null then
    raise exception 'sync_protocol_error' using errcode = '22023';
  end if;

  update public.gymos_sync as sync_row
  set
    payload = new_payload,
    revision = new_revision,
    device_id = new_device_id,
    checksum = new_checksum,
    updated_at = pg_catalog.now()
  where sync_row.user_id = current_user_id
    and sync_row.revision = expected_revision
    and sync_row.checksum = expected_checksum
  returning sync_row.revision, sync_row.checksum
  into written_revision, written_checksum;

  if found then
    return query select true, false, written_revision, written_checksum;
    return;
  end if;

  select sync_row.revision, sync_row.checksum
  into written_revision, written_checksum
  from public.gymos_sync as sync_row
  where sync_row.user_id = current_user_id;

  return query select false, true, written_revision, written_checksum;
end;
$$;

create or replace function public.gymos_sync_delete_own()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  delete from public.gymos_sync as sync_row
  where sync_row.user_id = current_user_id;

  return true;
end;
$$;

revoke all on function public.gymos_sync_compare_and_swap(bigint,text,bigint,text,text,jsonb) from public, anon;
revoke all on function public.gymos_sync_delete_own() from public, anon;
grant execute on function public.gymos_sync_compare_and_swap(bigint,text,bigint,text,text,jsonb) to authenticated;
grant execute on function public.gymos_sync_delete_own() to authenticated;

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
