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

-- Trainer running performance sessions.
-- Combines finished Aptus running workouts with persisted external running sessions.

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
  finished_at text,
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
  ),
  aptus_sessions as (
    select
      (
        'aptus-workout:' ||
        coalesce(
          workouts.data->>'workoutId',
          workouts.id
        )
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
      workouts.data->>'finishedAt' as finished_at,
      null::double precision as duration_seconds,
      'aptus_workout'::text as source
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
  ),
  external_sessions as (
    select
      (
        'health-connect:' ||
        running_sessions.id
      ) as id,
      'running'::text as discipline,
      case running_sessions.data->>'exercise_type'
        when '33' then 'Carrera exterior'
        when '34' then 'Carrera en cinta'
        else 'Carrera'
      end as title,
      running_sessions.started_at::text as event_at,
      null::text as routine_id,
      null::text as session_id,
      running_sessions.started_at::text as started_at,
      running_sessions.ended_at::text as finished_at,
      extract(
        epoch from (
          running_sessions.ended_at -
          running_sessions.started_at
        )
      )::double precision as duration_seconds,
      'health_connect'::text as source
    from authorized_relation
    join public.running_sessions
      on running_sessions.user_id =
         authorized_relation.athlete_id
  ),
  combined as (
    select * from aptus_sessions

    union all

    select * from external_sessions
  )
  select
    combined.id,
    combined.discipline,
    combined.title,
    combined.event_at,
    combined.routine_id,
    combined.session_id,
    combined.started_at,
    combined.finished_at,
    combined.duration_seconds,
    combined.source
  from combined
  order by
    combined.event_at::timestamptz desc,
    combined.source asc,
    combined.id asc
  limit 25;
$$;

revoke all
on function public.trainer_list_athlete_running_sessions(uuid)
from public, anon;

grant execute
on function public.trainer_list_athlete_running_sessions(uuid)
to authenticated;

notify pgrst, 'reload schema';

commit;
