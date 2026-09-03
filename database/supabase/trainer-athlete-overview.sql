-- Trainer athlete overview.
-- Run this once in the Supabase SQL Editor.

drop function if exists public.trainer_get_athlete_overview(uuid);

create function public.trainer_get_athlete_overview(
  p_athlete_id uuid
)
returns table (
  athlete_id uuid,
  status text,
  email text,
  display_name text,
  client_since timestamptz,
  health jsonb,
  recent_training jsonb,
  active_routines jsonb,
  trainer jsonb
)
language sql
security definer
set search_path = ''
as $$
  with authorized_relation as (
    select
      trainer_athletes.athlete_id,
      trainer_athletes.status,
      trainer_athletes.created_at as client_since
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
    authorized_relation.athlete_id,
    authorized_relation.status,
    athlete_users.email,
    profiles.display_name,
    authorized_relation.client_since,
    pg_catalog.jsonb_build_object(
      'measurement_date',
      latest_weight.measurement_date,
      'weight_kg',
      latest_weight.weight_kg,
      'body_fat_percent',
      latest_weight.body_fat_percent,
      'muscle_mass_kg',
      latest_weight.muscle_mass_kg,
      'body_water_percent',
      latest_weight.body_water_percent,
      'visceral_fat_index',
      latest_weight.visceral_fat_index,
      'waist_cm',
      latest_body.waist_cm
    ) as health,
    pg_catalog.jsonb_build_object(
      'last_completed',
      case
        when latest_workout.id is null then null
        else pg_catalog.jsonb_build_object(
          'workout_id',
          latest_workout.data->>'workoutId',
          'routine_id',
          latest_workout.data->>'routineId',
          'session_id',
          latest_workout.data->>'sessionId',
          'session_name',
          session_names.session_name,
          'finished_at',
          latest_workout.data->>'finishedAt'
        )
      end,
      'completed_last_7_days',
      coalesce(
        recent_counts.completed_last_7_days,
        0
      )
    ) as recent_training,
    pg_catalog.jsonb_build_object(
      'strength',
      active_routine_rows.strength,
      'swimming',
      active_routine_rows.swimming,
      'running',
      active_routine_rows.running,
      'cycling',
      active_routine_rows.cycling
    ) as active_routines,
    pg_catalog.jsonb_build_object(
      'last_assignment',
      case
        when latest_assignment.id is null then null
        else pg_catalog.jsonb_build_object(
          'template_id',
          latest_assignment.template_id,
          'routine_id',
          latest_assignment.routine_id,
          'discipline',
          latest_assignment.discipline,
          'assigned_at',
          latest_assignment.assigned_at
        )
      end
    ) as trainer
  from authorized_relation
  left join public.gymos_users as athlete_users
    on athlete_users.user_id = authorized_relation.athlete_id
  left join public.profiles
    on profiles.id = authorized_relation.athlete_id
  left join lateral (
    select
      health_weight_entries.measurement_date,
      health_weight_entries.weight_kg,
      health_weight_entries.body_fat_percent,
      health_weight_entries.muscle_mass_kg,
      health_weight_entries.body_water_percent,
      health_weight_entries.visceral_fat_index
    from public.health_weight_entries
    where health_weight_entries.user_id = authorized_relation.athlete_id
    order by health_weight_entries.measurement_date desc
    limit 1
  ) as latest_weight on true
  left join lateral (
    select
      health_body_measurements.waist_cm
    from public.health_body_measurements
    where health_body_measurements.user_id = authorized_relation.athlete_id
    order by health_body_measurements.measurement_date desc
    limit 1
  ) as latest_body on true
  left join lateral (
    select
      workouts.id,
      workouts.data
    from public.workouts
    where workouts.user_id = authorized_relation.athlete_id
      and workouts.data->>'status' = 'finished'
      and workouts.data ? 'finishedAt'
    order by (workouts.data->>'finishedAt')::timestamptz desc
    limit 1
  ) as latest_workout on true
  left join lateral (
    select
      coalesce(
        routine_session.session->>'name',
        routine_session.session->>'title'
      ) as session_name
    from public.routines
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(
        routines.data->'sessions',
        '[]'::jsonb
      )
    ) as routine_session(session)
    where routines.user_id = authorized_relation.athlete_id
      and routines.id = latest_workout.data->>'routineId'
      and routine_session.session->>'sessionId'
        = latest_workout.data->>'sessionId'
    limit 1
  ) as session_names on true
  left join lateral (
    select
      pg_catalog.count(*)::integer as completed_last_7_days
    from public.workouts
    where workouts.user_id = authorized_relation.athlete_id
      and workouts.data->>'status' = 'finished'
      and workouts.data ? 'finishedAt'
      and (workouts.data->>'finishedAt')::timestamptz
        >= pg_catalog.now() - interval '7 days'
  ) as recent_counts on true
  left join lateral (
    select
      (
        select pg_catalog.jsonb_build_object(
          'routine_id',
          active_routines.routine_id,
          'activated_at',
          active_routines.activated_at
        )
        from public.active_routines
        where active_routines.user_id = authorized_relation.athlete_id
          and active_routines.discipline = 'strength'
        limit 1
      ) as strength,
      (
        select pg_catalog.jsonb_build_object(
            'routine_id',
            active_routines.routine_id,
            'activated_at',
            active_routines.activated_at
        )
        from public.active_routines
        where active_routines.user_id = authorized_relation.athlete_id
          and active_routines.discipline = 'swimming'
        limit 1
      ) as swimming,
      (
        select pg_catalog.jsonb_build_object(
          'routine_id',
          active_routines.routine_id,
          'activated_at',
          active_routines.activated_at
        )
        from public.active_routines
        where active_routines.user_id = authorized_relation.athlete_id
          and active_routines.discipline = 'running'
        limit 1
      ) as running,
      (
        select pg_catalog.jsonb_build_object(
          'routine_id',
          active_routines.routine_id,
          'activated_at',
          active_routines.activated_at
        )
        from public.active_routines
        where active_routines.user_id = authorized_relation.athlete_id
          and active_routines.discipline = 'cycling'
        limit 1
      ) as cycling
  ) as active_routine_rows on true
  left join lateral (
    select
      trainer_routine_assignments.id,
      trainer_routine_assignments.template_id,
      trainer_routine_assignments.routine_id,
      trainer_routine_assignments.discipline,
      trainer_routine_assignments.assigned_at
    from public.trainer_routine_assignments
    where trainer_routine_assignments.trainer_id = (select auth.uid())
      and trainer_routine_assignments.athlete_id
        = authorized_relation.athlete_id
    order by trainer_routine_assignments.assigned_at desc
    limit 1
  ) as latest_assignment on true;
$$;

revoke all
on function public.trainer_get_athlete_overview(uuid)
from public, anon;

grant execute
on function public.trainer_get_athlete_overview(uuid)
to authenticated;

notify pgrst, 'reload schema';
