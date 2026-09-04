-- Trainer swimming session detail.
-- Run this once in the Supabase SQL Editor.

drop function if exists public.trainer_get_athlete_swimming_session(uuid, text);

create function public.trainer_get_athlete_swimming_session(
  p_athlete_id uuid,
  p_session_id text
)
returns table (
  id text,
  discipline text,
  title text,
  event_at text,
  started_at text,
  duration_seconds double precision,
  total_distance_meters double precision,
  pool_length_meters double precision,
  total_elapsed_time_seconds double precision,
  total_timer_time_seconds double precision,
  total_moving_time_seconds double precision,
  average_pace_seconds_per_100m double precision,
  total_strokes integer,
  heart_rate_average_bpm integer,
  heart_rate_max_bpm integer,
  total_calories integer,
  aerobic_training_effect double precision,
  anaerobic_training_effect double precision,
  average_stroke_rate_spm double precision,
  average_speed_meters_per_second double precision,
  max_speed_meters_per_second double precision,
  objective text,
  technical_focus jsonb,
  lengths jsonb
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
    session_numbers.duration_seconds,
    session_numbers.total_distance_meters,
    session_numbers.pool_length_meters,
    session_numbers.total_elapsed_time_seconds,
    session_numbers.total_timer_time_seconds,
    session_numbers.total_moving_time_seconds,
    session_numbers.average_pace_seconds_per_100m,
    session_numbers.total_strokes,
    session_numbers.heart_rate_average_bpm,
    session_numbers.heart_rate_max_bpm,
    session_numbers.total_calories,
    session_numbers.aerobic_training_effect,
    session_numbers.anaerobic_training_effect,
    session_numbers.average_stroke_rate_spm,
    session_numbers.average_speed_meters_per_second,
    session_numbers.max_speed_meters_per_second,
    nullif(swimming_sessions.data->>'objective', '') as objective,
    case
      when pg_catalog.jsonb_typeof(
        swimming_sessions.data->'technicalFocus'
      ) = 'array'
        then swimming_sessions.data->'technicalFocus'
      when pg_catalog.jsonb_typeof(
        swimming_sessions.data->'technical_focus'
      ) = 'array'
        then swimming_sessions.data->'technical_focus'
      else '[]'::jsonb
    end as technical_focus,
    coalesce(
      length_rows.lengths,
      '[]'::jsonb
    ) as lengths
  from authorized_relation
  join public.swimming_sessions
    on swimming_sessions.user_id = authorized_relation.athlete_id
   and swimming_sessions.id = p_session_id
  left join lateral (
    select
      case
        when pg_catalog.jsonb_typeof(
          swimming_sessions.data->'distance_meters'
        ) = 'number'
          then (swimming_sessions.data->>'distance_meters')::double precision
      end as total_distance_meters,
      case
        when pg_catalog.jsonb_typeof(
          swimming_sessions.data->'pool_length_meters'
        ) = 'number'
          then (swimming_sessions.data->>'pool_length_meters')::double precision
      end as pool_length_meters,
      case
        when pg_catalog.jsonb_typeof(
          swimming_sessions.data->'total_elapsed_time_seconds'
        ) = 'number'
          then (
            swimming_sessions.data->>'total_elapsed_time_seconds'
          )::double precision
      end as total_elapsed_time_seconds,
      case
        when pg_catalog.jsonb_typeof(
          swimming_sessions.data->'total_timer_time_seconds'
        ) = 'number'
          then (
            swimming_sessions.data->>'total_timer_time_seconds'
          )::double precision
      end as total_timer_time_seconds,
      case
        when pg_catalog.jsonb_typeof(
          swimming_sessions.data->'total_moving_time_seconds'
        ) = 'number'
          then (
            swimming_sessions.data->>'total_moving_time_seconds'
          )::double precision
      end as total_moving_time_seconds,
      case
        when pg_catalog.jsonb_typeof(
          swimming_sessions.data->'average_pace_seconds_per_100m'
        ) = 'number'
          then (
            swimming_sessions.data->>'average_pace_seconds_per_100m'
          )::double precision
      end as average_pace_seconds_per_100m,
      case
        when pg_catalog.jsonb_typeof(
          swimming_sessions.data->'total_strokes'
        ) = 'number'
          then (swimming_sessions.data->>'total_strokes')::integer
      end as total_strokes,
      case
        when pg_catalog.jsonb_typeof(
          swimming_sessions.data->'heart_rate_average_bpm'
        ) = 'number'
          then (swimming_sessions.data->>'heart_rate_average_bpm')::integer
      end as heart_rate_average_bpm,
      case
        when pg_catalog.jsonb_typeof(
          swimming_sessions.data->'heart_rate_max_bpm'
        ) = 'number'
          then (swimming_sessions.data->>'heart_rate_max_bpm')::integer
      end as heart_rate_max_bpm,
      case
        when pg_catalog.jsonb_typeof(
          swimming_sessions.data->'total_calories'
        ) = 'number'
          then (swimming_sessions.data->>'total_calories')::integer
      end as total_calories,
      case
        when pg_catalog.jsonb_typeof(
          swimming_sessions.data->'aerobic_training_effect'
        ) = 'number'
          then (swimming_sessions.data->>'aerobic_training_effect')::double precision
      end as aerobic_training_effect,
      case
        when pg_catalog.jsonb_typeof(
          swimming_sessions.data->'anaerobic_training_effect'
        ) = 'number'
          then (swimming_sessions.data->>'anaerobic_training_effect')::double precision
      end as anaerobic_training_effect,
      case
        when pg_catalog.jsonb_typeof(
          swimming_sessions.data->'average_stroke_rate_spm'
        ) = 'number'
          then (swimming_sessions.data->>'average_stroke_rate_spm')::double precision
      end as average_stroke_rate_spm,
      case
        when pg_catalog.jsonb_typeof(
          swimming_sessions.data->'average_speed_meters_per_second'
        ) = 'number'
          then (swimming_sessions.data->>'average_speed_meters_per_second')::double precision
      end as average_speed_meters_per_second,
      case
        when pg_catalog.jsonb_typeof(
          swimming_sessions.data->'max_speed_meters_per_second'
        ) = 'number'
          then (swimming_sessions.data->>'max_speed_meters_per_second')::double precision
      end as max_speed_meters_per_second
  ) as raw_numbers on true
  left join lateral (
    select
      raw_numbers.total_distance_meters,
      raw_numbers.pool_length_meters,
      raw_numbers.total_elapsed_time_seconds,
      raw_numbers.total_timer_time_seconds,
      raw_numbers.total_moving_time_seconds,
      raw_numbers.average_pace_seconds_per_100m,
      raw_numbers.total_strokes,
      raw_numbers.heart_rate_average_bpm,
      raw_numbers.heart_rate_max_bpm,
      raw_numbers.total_calories,
      raw_numbers.aerobic_training_effect,
      raw_numbers.anaerobic_training_effect,
      raw_numbers.average_stroke_rate_spm,
      raw_numbers.average_speed_meters_per_second,
      raw_numbers.max_speed_meters_per_second,
      coalesce(
        raw_numbers.total_timer_time_seconds,
        raw_numbers.total_elapsed_time_seconds,
        raw_numbers.total_moving_time_seconds
      ) as duration_seconds
  ) as session_numbers on true
  left join lateral (
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_strip_nulls(
        pg_catalog.jsonb_build_object(
          'start_time',
          swimming_length.value->>'start_time',
          'duration_seconds',
          case
            when pg_catalog.jsonb_typeof(
              swimming_length.value->'duration_seconds'
            ) = 'number'
              then swimming_length.value->'duration_seconds'
          end,
          'distance_meters',
          case
            when pg_catalog.jsonb_typeof(
              swimming_length.value->'distance_meters'
            ) = 'number'
              then swimming_length.value->'distance_meters'
          end,
          'total_strokes',
          case
            when pg_catalog.jsonb_typeof(
              swimming_length.value->'total_strokes'
            ) = 'number'
              then swimming_length.value->'total_strokes'
          end,
          'average_stroke_rate_spm',
          case
            when pg_catalog.jsonb_typeof(
              swimming_length.value->'average_stroke_rate_spm'
            ) = 'number'
              then swimming_length.value->'average_stroke_rate_spm'
          end,
          'stroke',
          swimming_length.value->>'swim_stroke',
          'length_type',
          swimming_length.value->>'length_type'
        )
      )
      order by swimming_length.ordinality
    ) as lengths
    from pg_catalog.jsonb_array_elements(
      coalesce(
        swimming_sessions.data->'lengths',
        '[]'::jsonb
      )
    ) with ordinality as swimming_length(value, ordinality)
  ) as length_rows on true
  limit 1;
$$;

revoke all
on function public.trainer_get_athlete_swimming_session(uuid, text)
from public, anon;

grant execute
on function public.trainer_get_athlete_swimming_session(uuid, text)
to authenticated;

notify pgrst, 'reload schema';
