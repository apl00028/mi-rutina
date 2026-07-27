-- GymOS account identity profile.
-- Run this once in the Supabase SQL Editor.

alter table public.profiles
  add column if not exists alias text,
  add column if not exists avatar_key text not null default 'initials';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_alias_length_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_alias_length_check
      check (alias is null or (alias = btrim(alias) and char_length(alias) <= 30));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_avatar_key_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_avatar_key_check
      check (avatar_key in ('initials','strength','energy','fire','heart','star'));
  end if;
end
$$;

alter table public.profiles enable row level security;

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
