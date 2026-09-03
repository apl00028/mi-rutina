-- Trainer swimming performance sessions.
-- Run this once in the Supabase SQL Editor.

drop function if exists public.trainer_list_athlete_swimming_sessions(uuid);

create function public.trainer_list_athlete_swimming_sessions(
  p_athlete_id uuid
)
returns table (
  id text,
  discipline text,
  title text,
  event_at text,
  started_at text,
  duration_seconds double precision,
  source text
)
language sql
security definer
set search_path = ''
as $$
  with authorized_relation as (
    select
      trainer_athletes.athlete_id
    from public.trainer_athletes
    join public.gymos_users as current_trainer
      on current_trainer.user_id = (select auth.uid())
     and current_trainer.role = 'trainer'
     and current_trainer.status = 'active'
    where trainer_athletes.trainer_id = (select auth.uid())
      and trainer_athletes.athlete_id = p_athlete_id
      and trainer_athletes.status = 'active'
    limit 1
  )
  select
    swimming_sessions.id,
    'swimming'::text as discipline,
    coalesce(
      nullif(swimming_sessions.data->>'title', ''),
      nullif(swimming_sessions.data->>'name', ''),
      'Natación'
    ) as title,
    swimming_sessions.started_at::text as event_at,
    swimming_sessions.started_at::text as started_at,
    session_duration.duration_seconds,
    swimming_sessions.source
  from authorized_relation
  join public.swimming_sessions
    on swimming_sessions.user_id = authorized_relation.athlete_id
  left join lateral (
    select coalesce(
      case
        when pg_catalog.jsonb_typeof(
          swimming_sessions.data->'total_timer_time_seconds'
        ) = 'number'
          then (
            swimming_sessions.data->>'total_timer_time_seconds'
          )::double precision
      end,
      case
        when pg_catalog.jsonb_typeof(
          swimming_sessions.data->'total_elapsed_time_seconds'
        ) = 'number'
          then (
            swimming_sessions.data->>'total_elapsed_time_seconds'
          )::double precision
      end,
      case
        when pg_catalog.jsonb_typeof(
          swimming_sessions.data->'total_moving_time_seconds'
        ) = 'number'
          then (
            swimming_sessions.data->>'total_moving_time_seconds'
          )::double precision
      end
    ) as duration_seconds
  ) as session_duration on true
  order by swimming_sessions.started_at desc
  limit 25;
$$;

revoke all
on function public.trainer_list_athlete_swimming_sessions(uuid)
from public, anon;

grant execute
on function public.trainer_list_athlete_swimming_sessions(uuid)
to authenticated;

notify pgrst, 'reload schema';
