-- Apply AFTER all trainer/invitation SQL files. See companion rollout document.
-- Existing relationships are preserved; no legacy grants are inferred.
begin;

-- Upgrade already-deployed invitation capabilities without recreating tables.
create or replace function aptus_private.connection_actor_role()
returns text language plpgsql security definer set search_path = '' as $$
declare actor_role text;
begin
  select u.role into actor_role from public.gymos_users u
  where u.user_id = auth.uid() and u.role in ('user', 'admin', 'trainer')
    and u.status = 'active' and (u.expires_at is null or u.expires_at > clock_timestamp());
  if not found then
    raise exception 'connection_actor_not_authorized' using errcode = '42501';
  end if;
  return actor_role;
end;
$$;

create or replace function aptus_private.create_trainer_athlete_invitation(
  p_contact_code_hash text, p_token_hash text, p_trainer_invites boolean
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_role text := aptus_private.connection_actor_role();
  target uuid;
  trainer uuid;
  athlete uuid;
  invitation_id uuid;
  created timestamptz;
begin
  if (p_trainer_invites and actor_role <> 'trainer')
    or (not p_trainer_invites and actor_role not in ('user', 'admin')) then
    raise exception 'connection_actor_not_authorized' using errcode = '42501';
  end if;
  if p_contact_code_hash is null or p_contact_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invitation_target_unavailable' using errcode = '22023';
  end if;
  select c.user_id into target
  from public.connection_contact_codes c join public.gymos_users u on u.user_id = c.user_id
  where c.code_hash = p_contact_code_hash and c.user_id <> actor
    and ((p_trainer_invites and u.role in ('user', 'admin'))
      or (not p_trainer_invites and u.role = 'trainer'))
    and u.status = 'active' and (u.expires_at is null or u.expires_at > clock_timestamp());
  if not found then
    raise exception 'invitation_target_unavailable' using errcode = '22023';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_invitation_token_hash' using errcode = '22023';
  end if;
  trainer := case when p_trainer_invites then actor else target end;
  athlete := case when p_trainer_invites then target else actor end;
  if exists (select 1 from public.trainer_athletes r
    where r.trainer_id = trainer and r.athlete_id = athlete and r.status = 'active') then
    raise exception 'invitation_conflict' using errcode = '23505';
  end if;
  update public.trainer_athlete_invitations i set status = 'expired'
  where i.trainer_id = trainer and i.athlete_id = athlete
    and i.status = 'pending' and i.expires_at <= clock_timestamp();
  -- The unique partial index, not a SELECT-then-INSERT check, arbitrates creates.
  created := clock_timestamp();
  insert into public.trainer_athlete_invitations(
    trainer_id, athlete_id, inviter_id, token_hash, status, created_at, expires_at
  ) values (trainer, athlete, actor, p_token_hash, 'pending', created, created + interval '7 days')
  returning id into invitation_id;
  -- INSERT may have waited for a concurrent acceptance to remove a pending index
  -- entry. Under READ COMMITTED this statement sees the newly active relationship.
  if exists (select 1 from public.trainer_athletes r
    where r.trainer_id = trainer and r.athlete_id = athlete and r.status = 'active') then
    raise exception 'invitation_conflict' using errcode = '23505';
  end if;
  return invitation_id;
exception when unique_violation then
  raise exception 'invitation_conflict' using errcode = '23505';
end;
$$;

create or replace function aptus_private.transition_trainer_athlete_invitation(p_invitation_id uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_role text := aptus_private.connection_actor_role();
  invitation public.trainer_athlete_invitations%rowtype;
  recipient uuid;
  changed uuid;
begin
  select * into invitation from public.trainer_athlete_invitations
  where id = p_invitation_id for update;
  recipient := case when invitation.inviter_id = invitation.trainer_id
    then invitation.athlete_id else invitation.trainer_id end;
  if not found
    or (actor_role = 'trainer' and actor <> invitation.trainer_id)
    or (actor_role in ('user', 'admin') and actor <> invitation.athlete_id)
    or (p_action = 'revoke' and actor <> invitation.inviter_id)
    or (p_action in ('accept', 'reject') and actor <> recipient)
    or p_action is null or p_action not in ('accept', 'reject', 'revoke') then
    raise exception 'invitation_not_available' using errcode = '42501';
  end if;
  if invitation.status <> 'pending' then
    raise exception 'invitation_not_pending' using errcode = '23505';
  end if;
  -- An exception rolls back writes; expiry is effective, not materialized here.
  if invitation.expires_at <= clock_timestamp() then
    raise exception 'invitation_expired' using errcode = '22023';
  end if;
  if p_action = 'accept' then
    if not exists (select 1 from public.gymos_users u where u.user_id = invitation.trainer_id
      and u.role = 'trainer' and u.status = 'active'
      and (u.expires_at is null or u.expires_at > clock_timestamp()))
      or not exists (select 1 from public.gymos_users u where u.user_id = invitation.athlete_id
      and u.role in ('user', 'admin') and u.status = 'active'
      and (u.expires_at is null or u.expires_at > clock_timestamp())) then
      raise exception 'invitation_accounts_not_eligible' using errcode = '42501';
    end if;
    insert into public.trainer_athletes as r(trainer_id, athlete_id, status)
    values (invitation.trainer_id, invitation.athlete_id, 'active')
    on conflict (trainer_id, athlete_id) do update
      set status = 'active', updated_at = clock_timestamp() where r.status = 'inactive'
    returning trainer_id into changed;
    if not found then
      raise exception 'relationship_already_active' using errcode = '23505';
    end if;
    update public.trainer_athlete_invitations
      set status = 'accepted', accepted_at = clock_timestamp() where id = invitation.id;
  else
    update public.trainer_athlete_invitations
      set status = 'revoked', revoked_at = clock_timestamp(), revoked_by = actor where id = invitation.id;
  end if;
end;
$$;

create or replace function aptus_private.list_my_trainer_athlete_invitations(p_sent boolean)
returns table (
  id uuid, trainer_id uuid, athlete_id uuid, inviter_id uuid, recipient_id uuid,
  direction text, status text, created_at timestamptz, expires_at timestamptz,
  accepted_at timestamptz, revoked_at timestamptz, revoked_by uuid,
  other_display_name text, other_alias text
)
language plpgsql security definer set search_path = '' as $$
declare actor_role text := aptus_private.connection_actor_role();
begin
  return query
  select i.id, i.trainer_id, i.athlete_id, i.inviter_id,
    case when i.inviter_id = i.trainer_id then i.athlete_id else i.trainer_id end,
    case when i.inviter_id = i.trainer_id then 'trainer_to_athlete' else 'athlete_to_trainer' end,
    case when i.status = 'pending' and i.expires_at <= clock_timestamp() then 'expired' else i.status end,
    i.created_at, i.expires_at, i.accepted_at, i.revoked_at, i.revoked_by,
    p.display_name, p.alias
  from public.trainer_athlete_invitations i
  left join public.profiles p on p.id = case when i.trainer_id = auth.uid() then i.athlete_id else i.trainer_id end
  where ((p_sent and i.inviter_id = auth.uid())
    or (not p_sent and (case when i.inviter_id = i.trainer_id then i.athlete_id else i.trainer_id end) = auth.uid()))
    and ((actor_role = 'trainer' and i.trainer_id = auth.uid())
      or (actor_role in ('user', 'admin') and i.athlete_id = auth.uid()))
  order by i.created_at desc, i.id;
end;
$$;

revoke all on function aptus_private.connection_actor_role() from public, anon, authenticated;
revoke all on function aptus_private.create_trainer_athlete_invitation(text, text, boolean) from public, anon, authenticated;
revoke all on function aptus_private.transition_trainer_athlete_invitation(uuid, text) from public, anon, authenticated;
revoke all on function aptus_private.list_my_trainer_athlete_invitations(boolean) from public, anon, authenticated;
revoke all on schema aptus_private from public, anon, authenticated;

create table public.trainer_athlete_permissions (
  trainer_id uuid not null,
  athlete_id uuid not null,
  domain text not null check (domain in ('swimming', 'running', 'cycling', 'strength', 'health')),
  granted_at timestamptz not null default clock_timestamp(),
  primary key (trainer_id, athlete_id, domain),
  foreign key (trainer_id, athlete_id)
    references public.trainer_athletes(trainer_id, athlete_id) on delete cascade
);
alter table public.trainer_athlete_permissions enable row level security;
revoke all on public.trainer_athlete_permissions from public, anon, authenticated;

-- Private helper: identity of an active, eligible pair; no domain data returned.
create function aptus_private.trainer_has_active_athlete(p_athlete_id uuid)
returns boolean language sql security definer set search_path = '' as $$
  select exists (
    select 1 from public.trainer_athletes r
    join public.gymos_users t on t.user_id = r.trainer_id
    join public.gymos_users a on a.user_id = r.athlete_id
    where r.trainer_id = auth.uid() and r.athlete_id = p_athlete_id and r.status = 'active'
      and t.role = 'trainer' and t.status = 'active'
      and (t.expires_at is null or t.expires_at > clock_timestamp())
      and a.role in ('user', 'admin') and a.status = 'active'
      and (a.expires_at is null or a.expires_at > clock_timestamp())
  );
$$;
revoke all on function aptus_private.trainer_has_active_athlete(uuid) from public, anon, authenticated;

-- This narrow boolean is public because the assignments RLS policy also calls it.
-- Actor is always auth.uid(); an arbitrary trainer ID is never accepted.
create function public.trainer_has_athlete_domain(p_athlete_id uuid, p_domain text)
returns boolean language sql security definer set search_path = '' as $$
  select aptus_private.trainer_has_active_athlete(p_athlete_id) and exists (
    select 1 from public.trainer_athlete_permissions p
    where p.trainer_id = auth.uid() and p.athlete_id = p_athlete_id and p.domain = p_domain
  );
$$;
revoke all on function public.trainer_has_athlete_domain(uuid, text) from public, anon, authenticated;
grant execute on function public.trainer_has_athlete_domain(uuid, text) to authenticated;

create function public.list_my_trainer_athlete_connections()
returns table (
  trainer_id uuid, athlete_id uuid, status text, created_at timestamptz, updated_at timestamptz,
  other_display_name text, other_alias text, domains text[]
)
language plpgsql security definer set search_path = '' as $$
declare actor_role text := aptus_private.connection_actor_role();
begin
  return query
  select r.trainer_id, r.athlete_id, r.status, r.created_at, r.updated_at,
    p.display_name, p.alias,
    array(select permission.domain from public.trainer_athlete_permissions permission
      where permission.trainer_id = r.trainer_id and permission.athlete_id = r.athlete_id
      order by permission.domain)
  from public.trainer_athletes r
  left join public.profiles p on p.id = case when actor_role = 'trainer' then r.athlete_id else r.trainer_id end
  where r.status = 'active' and (
    (actor_role = 'trainer' and r.trainer_id = auth.uid()) or
    (actor_role in ('user', 'admin') and r.athlete_id = auth.uid())
  ) order by r.created_at, r.trainer_id, r.athlete_id;
end;
$$;

create function public.set_my_trainer_permissions(
  p_trainer_id uuid, p_domains text[], p_expected_updated_at timestamptz
)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare relation public.trainer_athletes%rowtype; stamp timestamptz;
begin
  if aptus_private.connection_actor_role() not in ('user', 'admin') then
    raise exception 'connection_actor_not_authorized' using errcode = '42501';
  end if;
  if p_domains is null or array_position(p_domains, null) is not null
    or not (p_domains <@ array['swimming', 'running', 'cycling', 'strength', 'health']::text[])
    or cardinality(p_domains) <> (select count(distinct d) from unnest(p_domains) d) then
    raise exception 'connection_permissions_invalid' using errcode = '22023';
  end if;
  select * into relation from public.trainer_athletes r
    where r.trainer_id = p_trainer_id and r.athlete_id = auth.uid() for update;
  if not found or relation.status <> 'active' then
    raise exception 'connection_not_available' using errcode = '42501';
  end if;
  if p_expected_updated_at is distinct from relation.updated_at then
    raise exception 'connection_changed' using errcode = '40001';
  end if;
  delete from public.trainer_athlete_permissions where trainer_id = p_trainer_id and athlete_id = auth.uid();
  insert into public.trainer_athlete_permissions(trainer_id, athlete_id, domain)
    select p_trainer_id, auth.uid(), d from unnest(p_domains) d;
  stamp := greatest(clock_timestamp(), relation.updated_at + interval '1 microsecond');
  update public.trainer_athletes set updated_at = stamp
    where trainer_id = p_trainer_id and athlete_id = auth.uid();
  return stamp;
end;
$$;

create function public.unlink_my_trainer_athlete_connection(p_other_user_id uuid, p_expected_updated_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_role text := aptus_private.connection_actor_role(); relation public.trainer_athletes%rowtype;
begin
  select * into relation from public.trainer_athletes r
  where (actor_role = 'trainer' and r.trainer_id = auth.uid() and r.athlete_id = p_other_user_id)
     or (actor_role in ('user', 'admin') and r.athlete_id = auth.uid() and r.trainer_id = p_other_user_id)
  for update;
  if not found or relation.status <> 'active' then
    raise exception 'connection_not_available' using errcode = '42501';
  end if;
  if p_expected_updated_at is distinct from relation.updated_at then
    raise exception 'connection_changed' using errcode = '40001';
  end if;
  update public.trainer_athletes set status = 'inactive',
    updated_at = greatest(clock_timestamp(), relation.updated_at + interval '1 microsecond')
    where trainer_id = relation.trainer_id and athlete_id = relation.athlete_id;
end;
$$;

-- A reactivated relationship must never inherit consent from a previous link.
create function aptus_private.clear_relationship_permissions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from new.status or new.status <> 'active' then
    delete from public.trainer_athlete_permissions where trainer_id = old.trainer_id and athlete_id = old.athlete_id;
  end if;
  return new;
end;
$$;
revoke all on function aptus_private.clear_relationship_permissions() from public, anon, authenticated;
create trigger clear_relationship_permissions after update of status on public.trainer_athletes
  for each row execute function aptus_private.clear_relationship_permissions();

revoke all on function public.list_my_trainer_athlete_connections() from public, anon, authenticated;
revoke all on function public.set_my_trainer_permissions(uuid, text[], timestamptz) from public, anon, authenticated;
revoke all on function public.unlink_my_trainer_athlete_connection(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.list_my_trainer_athlete_connections() to authenticated;
grant execute on function public.set_my_trainer_permissions(uuid, text[], timestamptz) to authenticated;
grant execute on function public.unlink_my_trainer_athlete_connection(uuid, timestamptz) to authenticated;

-- Preserve participant relationship reads, remove direct mutation privileges.
revoke insert, update, delete, truncate, references, trigger on public.trainer_athletes from public, anon, authenticated;
drop policy "Trainers can read their athlete relationships" on public.trainer_athletes;
create policy "Trainers can read their athlete relationships" on public.trainer_athletes
  for select to authenticated using ((trainer_id = auth.uid() and exists (select 1 from public.gymos_users u
      where u.user_id = auth.uid() and u.role = 'trainer' and u.status = 'active'
      and (u.expires_at is null or u.expires_at > clock_timestamp()))));
drop policy "Athletes can read their trainer relationships" on public.trainer_athletes;
create policy "Athletes can read their trainer relationships" on public.trainer_athletes
  for select to authenticated using (athlete_id = auth.uid() and exists (
    select 1 from public.gymos_users u where u.user_id = auth.uid() and u.role in ('user', 'admin')
      and u.status = 'active' and (u.expires_at is null or u.expires_at > clock_timestamp())));
drop policy "Trainers can read their routine assignments" on public.trainer_routine_assignments;
create policy "Trainers can read their routine assignments" on public.trainer_routine_assignments
  for select to authenticated using (trainer_id = auth.uid()
    and public.trainer_has_athlete_domain(athlete_id, discipline));


-- Hardened strength-sessions; original response contract preserved.
create or replace function public.trainer_list_athlete_strength_sessions(
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
      and public.trainer_has_athlete_domain(trainer_athletes.athlete_id, 'strength')
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




-- Hardened swimming-sessions; original response contract preserved.
create or replace function public.trainer_list_athlete_swimming_sessions(
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
      and public.trainer_has_athlete_domain(trainer_athletes.athlete_id, 'swimming')
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




-- Hardened swimming-session-detail; original response contract preserved.
create or replace function public.trainer_get_athlete_swimming_session(
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
      and public.trainer_has_athlete_domain(trainer_athletes.athlete_id, 'swimming')
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




-- Hardened running-sessions; original response contract preserved.
create or replace function public.trainer_list_athlete_running_sessions(
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
      and public.trainer_has_athlete_domain(trainer_athletes.athlete_id, 'running')
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




-- Hardened running-session-detail; original response contract preserved.
create or replace function public.trainer_get_athlete_running_session(
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
      and public.trainer_has_athlete_domain(trainer_athletes.athlete_id, 'running')
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




-- Hardened identities; original response contract preserved.
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
      and aptus_private.trainer_has_active_athlete(trainer_athletes.athlete_id)
  order by trainer_athletes.created_at asc;
$$;

revoke all
on function public.trainer_list_athlete_identities()
from public, anon;

grant execute
on function public.trainer_list_athlete_identities()
to authenticated;




-- Hardened overview; original response contract preserved.
create or replace function public.trainer_get_athlete_overview(
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
      and aptus_private.trainer_has_active_athlete(trainer_athletes.athlete_id)
    limit 1
  )
  select
    authorized_relation.athlete_id,
    authorized_relation.status,
    athlete_users.email,
    profiles.display_name,
    authorized_relation.client_since,
    pg_catalog.jsonb_build_object(
      'weight_measurement_date',
      latest_weight.measurement_date,
      'waist_measurement_date',
      latest_body.measurement_date,
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
          'name',
          coalesce(
            latest_assignment.template_name,
            latest_assignment.routine_name
          ),
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
      and public.trainer_has_athlete_domain(authorized_relation.athlete_id, 'health')
    order by health_weight_entries.measurement_date desc
    limit 1
  ) as latest_weight on true
  left join lateral (
    select
      health_body_measurements.measurement_date,
      health_body_measurements.waist_cm
    from public.health_body_measurements
    where health_body_measurements.user_id = authorized_relation.athlete_id
      and public.trainer_has_athlete_domain(authorized_relation.athlete_id, 'health')
    order by health_body_measurements.measurement_date desc
    limit 1
  ) as latest_body on true
  left join lateral (
    select
      workouts.id,
      workouts.data
    from public.workouts
    where workouts.user_id = authorized_relation.athlete_id
      and exists (select 1 from public.routines permission_routine
        where permission_routine.user_id = workouts.user_id
          and permission_routine.id = workouts.data->>'routineId'
          and public.trainer_has_athlete_domain(authorized_relation.athlete_id, permission_routine.discipline))
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
      and exists (select 1 from public.routines permission_routine
        where permission_routine.user_id = workouts.user_id
          and permission_routine.id = workouts.data->>'routineId'
          and public.trainer_has_athlete_domain(authorized_relation.athlete_id, permission_routine.discipline))
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
          'name',
          routines.data->>'name',
          'activated_at',
          active_routines.activated_at
        )
        from public.active_routines
        left join public.routines
          on routines.user_id = active_routines.user_id
         and routines.id = active_routines.routine_id
        where active_routines.user_id = authorized_relation.athlete_id
          and active_routines.discipline = 'strength'
          and public.trainer_has_athlete_domain(authorized_relation.athlete_id, 'strength')
        limit 1
      ) as strength,
      (
        select pg_catalog.jsonb_build_object(
            'routine_id',
            active_routines.routine_id,
            'name',
            routines.data->>'name',
            'activated_at',
            active_routines.activated_at
        )
        from public.active_routines
        left join public.routines
          on routines.user_id = active_routines.user_id
         and routines.id = active_routines.routine_id
        where active_routines.user_id = authorized_relation.athlete_id
          and active_routines.discipline = 'swimming'
          and public.trainer_has_athlete_domain(authorized_relation.athlete_id, 'swimming')
        limit 1
      ) as swimming,
      (
        select pg_catalog.jsonb_build_object(
          'routine_id',
          active_routines.routine_id,
          'name',
          routines.data->>'name',
          'activated_at',
          active_routines.activated_at
        )
        from public.active_routines
        left join public.routines
          on routines.user_id = active_routines.user_id
         and routines.id = active_routines.routine_id
        where active_routines.user_id = authorized_relation.athlete_id
          and active_routines.discipline = 'running'
          and public.trainer_has_athlete_domain(authorized_relation.athlete_id, 'running')
        limit 1
      ) as running,
      (
        select pg_catalog.jsonb_build_object(
          'routine_id',
          active_routines.routine_id,
          'name',
          routines.data->>'name',
          'activated_at',
          active_routines.activated_at
        )
        from public.active_routines
        left join public.routines
          on routines.user_id = active_routines.user_id
         and routines.id = active_routines.routine_id
        where active_routines.user_id = authorized_relation.athlete_id
          and active_routines.discipline = 'cycling'
          and public.trainer_has_athlete_domain(authorized_relation.athlete_id, 'cycling')
        limit 1
      ) as cycling
  ) as active_routine_rows on true
  left join lateral (
    select
      trainer_routine_assignments.id,
      trainer_routine_assignments.template_id,
      trainer_routine_assignments.routine_id,
      trainer_routine_templates.name as template_name,
      routines.data->>'name' as routine_name,
      trainer_routine_assignments.discipline,
      trainer_routine_assignments.assigned_at
    from public.trainer_routine_assignments
    left join public.trainer_routine_templates
      on trainer_routine_templates.trainer_id
        = trainer_routine_assignments.trainer_id
     and trainer_routine_templates.id
        = trainer_routine_assignments.template_id
    left join public.routines
      on routines.user_id = trainer_routine_assignments.athlete_id
     and routines.id = trainer_routine_assignments.routine_id
    where trainer_routine_assignments.trainer_id = (select auth.uid())
      and public.trainer_has_athlete_domain(authorized_relation.athlete_id, trainer_routine_assignments.discipline)
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




-- Assignment requires the same discipline grant.
create or replace function public.trainer_assign_routine_template(
  p_athlete_id uuid,
  p_template_id text,
  p_routine_id text
)
returns table(
  assignment_id uuid,
  athlete_id uuid,
  template_id text,
  routine_id text,
  discipline text,
  assigned_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_trainer_id uuid := auth.uid();
  created_assignment_id uuid;
  template_discipline text;
  template_data jsonb;
  generated_routine_data jsonb;
  effective_assigned_at timestamptz := pg_catalog.now();
begin
  if current_trainer_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from auth.users
    where users.id = current_trainer_id
  ) then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_athlete_id is null
    or p_template_id is null
    or p_template_id <> pg_catalog.btrim(p_template_id)
    or pg_catalog.char_length(p_template_id) = 0
    or p_routine_id is null
    or p_routine_id <> pg_catalog.btrim(p_routine_id)
    or pg_catalog.char_length(p_routine_id) = 0
  then
    raise exception 'invalid_assignment_payload' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.gymos_users
    where gymos_users.user_id = current_trainer_id
      and gymos_users.role = 'trainer'
      and gymos_users.status = 'active'
  ) then
    raise exception 'trainer_not_authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.trainer_athletes
    where trainer_athletes.trainer_id = current_trainer_id
      and trainer_athletes.athlete_id = p_athlete_id
      and trainer_athletes.status = 'active'
  ) then
    raise exception 'trainer_athlete_relationship_not_found'
      using errcode = 'P0002';
  end if;

  select
    trainer_routine_templates.discipline,
    trainer_routine_templates.data
  into
    template_discipline,
    template_data
    from public.trainer_routine_templates
    where trainer_routine_templates.trainer_id = current_trainer_id
      and trainer_routine_templates.id = p_template_id
    limit 1;

  if not found then
    raise exception 'trainer_template_not_found'
      using errcode = 'P0002';
  end if;

  -- Serialize assignment against permission changes/unlink on the same pair.
  perform 1 from public.trainer_athletes r where r.trainer_id = auth.uid()
    and r.athlete_id = p_athlete_id for update;
  if not public.trainer_has_athlete_domain(p_athlete_id, template_discipline) then
    raise exception 'trainer_domain_not_authorized' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.routines
    where routines.user_id = p_athlete_id
      and routines.id = p_routine_id
  ) then
    raise exception 'routine_already_exists' using errcode = '23505';
  end if;

  generated_routine_data := template_data;
  generated_routine_data := pg_catalog.jsonb_set(
    generated_routine_data,
    '{routineId}',
    pg_catalog.to_jsonb(p_routine_id),
    true
  );
  generated_routine_data := pg_catalog.jsonb_set(
    generated_routine_data,
    '{discipline}',
    pg_catalog.to_jsonb(template_discipline),
    true
  );
  generated_routine_data := pg_catalog.jsonb_set(
    generated_routine_data,
    '{source}',
    pg_catalog.jsonb_build_object(
      'type',
      'trainer_template',
      'trainerId',
      current_trainer_id,
      'templateId',
      p_template_id,
      'assignedAt',
      effective_assigned_at
    ),
    true
  );

  insert into public.routines (
    id,
    user_id,
    data,
    created_at,
    updated_at
  )
  values (
    p_routine_id,
    p_athlete_id,
    generated_routine_data,
    effective_assigned_at,
    effective_assigned_at
  );

  insert into public.trainer_routine_assignments (
    trainer_id,
    athlete_id,
    template_id,
    routine_id,
    discipline,
    assigned_at
  )
  values (
    current_trainer_id,
    p_athlete_id,
    p_template_id,
    p_routine_id,
    template_discipline,
    effective_assigned_at
  )
  returning id
  into created_assignment_id;

  return query
    select
      created_assignment_id,
      p_athlete_id,
      p_template_id,
      p_routine_id,
      template_discipline,
      effective_assigned_at;
end;
$$;


revoke all
on function public.trainer_assign_routine_template(
  uuid,
  text,
  text
)
from public, anon;

grant execute
on function public.trainer_assign_routine_template(
  uuid,
  text,
  text
)
to authenticated;

notify pgrst, 'reload schema';
commit;
