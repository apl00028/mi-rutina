-- Trainer athlete identity listing.
-- Run this once in the Supabase SQL Editor.

create or replace function public.trainer_list_athlete_identities()
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
