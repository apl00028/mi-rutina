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

-- Trainer running session detail.
-- Exposes persisted Health Connect running metrics only to the linked trainer.

drop function if exists public.trainer_get_athlete_running_session(uuid, text);

create function public.trainer_get_athlete_running_session(
  p_athlete_id uuid,
  p_session_id text
)
returns table (
  id text,
  discipline text,
  title text,
  event_at text,
  started_at text,
  finished_at text,
  duration_seconds double precision,
  distance_meters double precision,
  average_pace_seconds_per_km double precision,
  heart_rate_average_bpm double precision,
  heart_rate_max_bpm double precision,
  average_speed_meters_per_second double precision,
  max_speed_meters_per_second double precision,
  has_route boolean,
  source_package text
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
    running_sessions.started_at::text as started_at,
    running_sessions.ended_at::text as finished_at,
    extract(
      epoch from (
        running_sessions.ended_at -
        running_sessions.started_at
      )
    )::double precision as duration_seconds,

    metric_values.distance_meters,

    case
      when metric_values.average_speed_meters_per_second > 0
        then (
          1000.0 /
          metric_values.average_speed_meters_per_second
        )::double precision
    end as average_pace_seconds_per_km,

    metric_values.heart_rate_average_bpm,
    metric_values.heart_rate_max_bpm,
    metric_values.average_speed_meters_per_second,
    metric_values.max_speed_meters_per_second,
    metric_values.has_route,
    running_sessions.source_package

  from authorized_relation
  join public.running_sessions
    on running_sessions.user_id =
       authorized_relation.athlete_id
   and (
     'health-connect:' ||
     running_sessions.id
   ) = p_session_id

  left join lateral (
    select
      case
        when pg_catalog.jsonb_typeof(
          running_sessions.data->'distance_meters'
        ) = 'number'
          then (
            running_sessions.data->>'distance_meters'
          )::double precision
      end as distance_meters,

      case
        when pg_catalog.jsonb_typeof(
          running_sessions.data->'heart_rate_average_bpm'
        ) = 'number'
          then (
            running_sessions.data->>'heart_rate_average_bpm'
          )::double precision
      end as heart_rate_average_bpm,

      case
        when pg_catalog.jsonb_typeof(
          running_sessions.data->'heart_rate_max_bpm'
        ) = 'number'
          then (
            running_sessions.data->>'heart_rate_max_bpm'
          )::double precision
      end as heart_rate_max_bpm,

      case
        when pg_catalog.jsonb_typeof(
          running_sessions.data->'speed_average_meters_per_second'
        ) = 'number'
          then (
            running_sessions.data->>'speed_average_meters_per_second'
          )::double precision
      end as average_speed_meters_per_second,

      case
        when pg_catalog.jsonb_typeof(
          running_sessions.data->'speed_max_meters_per_second'
        ) = 'number'
          then (
            running_sessions.data->>'speed_max_meters_per_second'
          )::double precision
      end as max_speed_meters_per_second,

      case
        when pg_catalog.jsonb_typeof(
          running_sessions.data->'has_route'
        ) = 'boolean'
          then (
            running_sessions.data->>'has_route'
          )::boolean
      end as has_route

  ) as metric_values on true

  limit 1;
$$;

revoke all
on function public.trainer_get_athlete_running_session(uuid, text)
from public, anon;

grant execute
on function public.trainer_get_athlete_running_session(uuid, text)
to authenticated;

notify pgrst, 'reload schema';

commit;
