-- Historical bootstrap only. Keep this guard before every schema mutation.
-- The transaction also prevents partial application if the client continues on error.
begin;
do $permissions_guard$
begin
  if pg_catalog.to_regclass('public.trainer_athlete_permissions') is not null then
    raise exception 'trainer_permissions_installed: historical trainer SQL cannot be reapplied'
      using errcode = '55000',
            hint = 'Use a reviewed forward migration; do not reapply historical trainer SQL.';
  end if;
end;
$permissions_guard$;

-- Trainer athlete identity listing.
-- Run this once in the Supabase SQL Editor.

drop function if exists public.trainer_list_athlete_identities();

create function public.trainer_list_athlete_identities()
returns table (
  athlete_id uuid,
  status text,
  email text,
  display_name text,
  client_since timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    trainer_athletes.athlete_id,
    trainer_athletes.status,
    athlete_users.email,
    profiles.display_name,
    trainer_athletes.created_at as client_since
  from public.trainer_athletes
  join public.gymos_users as current_trainer
    on current_trainer.user_id = (select auth.uid())
   and current_trainer.role = 'trainer'
   and current_trainer.status = 'active'
  left join public.gymos_users as athlete_users
    on athlete_users.user_id = trainer_athletes.athlete_id
  left join public.profiles
    on profiles.id = trainer_athletes.athlete_id
  where trainer_athletes.trainer_id = (select auth.uid())
    and trainer_athletes.status = 'active'
  order by trainer_athletes.created_at asc;
$$;

revoke all
on function public.trainer_list_athlete_identities()
from public, anon;

grant execute
on function public.trainer_list_athlete_identities()
to authenticated;

notify pgrst, 'reload schema';

commit;
