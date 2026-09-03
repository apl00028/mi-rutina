-- Trainer running performance sessions.
-- Run this once in the Supabase SQL Editor.

drop function if exists public.trainer_list_athlete_running_sessions(uuid);

create function public.trainer_list_athlete_running_sessions(
  p_athlete_id uuid
)
returns table (
  id text,
  discipline text,
  title text,
  event_at text,
  routine_id text,
  session_id text,
  started_at text,
  finished_at text
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
    coalesce(
      workouts.data->>'workoutId',
      workouts.id
    ) as id,
    'running'::text as discipline,
    coalesce(
      session_definition.session_name,
      nullif(workouts.data->>'sessionName', ''),
      nullif(workouts.data->>'sessionId', ''),
      'Carrera'
    ) as title,
    workouts.data->>'finishedAt' as event_at,
    workouts.data->>'routineId' as routine_id,
    workouts.data->>'sessionId' as session_id,
    workouts.data->>'startedAt' as started_at,
    workouts.data->>'finishedAt' as finished_at
  from authorized_relation
  join public.workouts
    on workouts.user_id = authorized_relation.athlete_id
  join public.routines
    on routines.user_id = authorized_relation.athlete_id
   and routines.id = workouts.data->>'routineId'
   and routines.discipline = 'running'
  left join lateral (
    select
      coalesce(
        routine_session.session->>'name',
        routine_session.session->>'title'
      ) as session_name
    from pg_catalog.jsonb_array_elements(
      coalesce(
        routines.data->'sessions',
        '[]'::jsonb
      )
    ) as routine_session(session)
    where routine_session.session->>'sessionId'
      = workouts.data->>'sessionId'
    limit 1
  ) as session_definition on true
  where workouts.data->>'status' = 'finished'
    and workouts.data ? 'finishedAt'
  order by (workouts.data->>'finishedAt')::timestamptz desc
  limit 25;
$$;

revoke all
on function public.trainer_list_athlete_running_sessions(uuid)
from public, anon;

grant execute
on function public.trainer_list_athlete_running_sessions(uuid)
to authenticated;

notify pgrst, 'reload schema';
