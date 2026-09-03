-- Trainer strength performance sessions.
-- Run this once in the Supabase SQL Editor.

drop function if exists public.trainer_list_athlete_strength_sessions(uuid);

create function public.trainer_list_athlete_strength_sessions(
  p_athlete_id uuid
)
returns table (
  workout_id text,
  routine_id text,
  session_id text,
  session_name text,
  started_at text,
  finished_at text,
  exercises jsonb
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
    workouts.data->>'workoutId' as workout_id,
    workouts.data->>'routineId' as routine_id,
    workouts.data->>'sessionId' as session_id,
    session_definition.session_name,
    workouts.data->>'startedAt' as started_at,
    workouts.data->>'finishedAt' as finished_at,
    coalesce(
      exercise_rows.exercises,
      '[]'::jsonb
    ) as exercises
  from authorized_relation
  join public.workouts
    on workouts.user_id = authorized_relation.athlete_id
  join public.routines
    on routines.user_id = authorized_relation.athlete_id
   and routines.id = workouts.data->>'routineId'
   and routines.discipline = 'strength'
  left join lateral (
    select
      routine_session.session,
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
  left join lateral (
    select
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'exercise_id',
          grouped_sets.exercise_id,
          'exercise_name',
          coalesce(
            exercise_definition.exercise_name,
            grouped_sets.exercise_id
          ),
          'sets',
          grouped_sets.sets
        )
        order by grouped_sets.first_set_order
      ) as exercises
    from (
      select
        workout_set.value->>'exerciseId' as exercise_id,
        pg_catalog.min(workout_set.ordinality) as first_set_order,
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'set_index',
            workout_set.value->'setIndex',
            'set_order',
            workout_set.ordinality,
            'set_type',
            workout_set.value->'setType',
            'reps',
            workout_set.value->'reps',
            'weight_kg',
            workout_set.value->'weight',
            'rir',
            workout_set.value->'rir',
            'rpe',
            workout_set.value->'rpe',
            'duration_seconds',
            workout_set.value->'durationSeconds'
          )
          order by workout_set.ordinality
        ) as sets
      from pg_catalog.jsonb_array_elements(
        coalesce(
          workouts.data->'sets',
          '[]'::jsonb
        )
      ) with ordinality as workout_set(value, ordinality)
      where workout_set.value->>'exerciseId' is not null
      group by workout_set.value->>'exerciseId'
    ) as grouped_sets
    left join lateral (
      select
        coalesce(
          routine_exercise.exercise->>'name',
          routine_exercise.exercise->>'title'
        ) as exercise_name
      from pg_catalog.jsonb_array_elements(
        coalesce(
          session_definition.session->'exercises',
          '[]'::jsonb
        )
      ) as routine_exercise(exercise)
      where routine_exercise.exercise->>'exerciseId'
        = grouped_sets.exercise_id
      limit 1
    ) as exercise_definition on true
  ) as exercise_rows on true
  where workouts.data->>'status' = 'finished'
    and workouts.data ? 'finishedAt'
  order by (workouts.data->>'finishedAt')::timestamptz desc
  limit 25;
$$;

revoke all
on function public.trainer_list_athlete_strength_sessions(uuid)
from public, anon;

grant execute
on function public.trainer_list_athlete_strength_sessions(uuid)
to authenticated;

notify pgrst, 'reload schema';
