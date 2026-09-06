-- Health Connect running persistence. Apply before delete-account.sql.
-- See running-sessions.md for the RPC contract and local integration tests.
begin;

create table public.running_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null default pg_catalog.gen_random_uuid()::text
    check (id !~ '^[[:space:]]*$'),
  source text not null check (source = 'health_connect'),
  source_package text not null
    check (source_package !~ '^[[:space:]]*$' and length(source_package) <= 256),
  source_record_id text not null
    check (source_record_id !~ '^[[:space:]]*$' and length(source_record_id) <= 1024),
  started_at timestamptz not null check (pg_catalog.isfinite(started_at)),
  ended_at timestamptz not null check (pg_catalog.isfinite(ended_at)),
  data jsonb not null default '{}'::jsonb
    check (pg_catalog.jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (user_id, id),
  unique (user_id, source, source_package, source_record_id),
  check (ended_at >= started_at)
);

create index running_sessions_user_started_id_idx
  on public.running_sessions (user_id, started_at desc, id desc);

alter table public.running_sessions enable row level security;
revoke all on public.running_sessions from public, anon, authenticated;
grant select on public.running_sessions to authenticated;

create policy running_sessions_select_own
on public.running_sessions for select to authenticated
using ((select auth.uid()) = user_id);

-- Keep the privileged implementation outside the exposed public schema.
create schema if not exists aptus_private;
revoke all on schema aptus_private from public, anon, authenticated;

create function aptus_private.upsert_my_running_session(p_session jsonb)
returns setof public.running_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  session_data jsonb;
  field_name text;
  field_value jsonb;
  start_instant timestamptz;
  end_instant timestamptz;
begin
  if owner_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if pg_catalog.jsonb_typeof(p_session) is distinct from 'object' then
    raise exception 'invalid_running_session' using errcode = '22023';
  end if;

  if not (p_session ?& array[
    'source_package', 'source_record_id', 'started_at', 'ended_at', 'data'
  ]) or exists (
    select 1 from pg_catalog.jsonb_object_keys(p_session) as fields(name)
    where name <> all (array[
      'source_package', 'source_record_id', 'started_at', 'ended_at', 'data'
    ])
  ) then
    raise exception 'invalid_running_session_fields' using errcode = '22023';
  end if;

  foreach field_name in array array[
    'source_package', 'source_record_id', 'started_at', 'ended_at'
  ] loop
    if pg_catalog.jsonb_typeof(p_session->field_name) is distinct from 'string'
      or p_session->>field_name ~ '^[[:space:]]*$' then
      raise exception 'invalid_running_session_string: %', field_name
        using errcode = '22023';
    end if;
  end loop;

  -- Require an explicit offset; never interpret a device timestamp in the
  -- database session timezone. Casts also reject invalid dates/times.
  if p_session->>'started_at' !~
      '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$'
    or p_session->>'ended_at' !~
      '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then
    raise exception 'running_timestamps_require_offset' using errcode = '22023';
  end if;
  start_instant := (p_session->>'started_at')::timestamptz;
  end_instant := (p_session->>'ended_at')::timestamptz;

  session_data := p_session->'data';
  if pg_catalog.jsonb_typeof(session_data) is distinct from 'object' then
    raise exception 'invalid_running_data' using errcode = '22023';
  end if;
  if session_data->'schema_version' is distinct from '1'::jsonb
    or not coalesce(session_data->'exercise_type' in ('33'::jsonb, '34'::jsonb), false) then
    raise exception 'unsupported_running_schema_or_type' using errcode = '22023';
  end if;

  for field_name, field_value in
    select key, value from pg_catalog.jsonb_each(session_data)
  loop
    if field_name in ('schema_version', 'exercise_type') then
      continue;
    elsif field_name = 'has_route' then
      if pg_catalog.jsonb_typeof(field_value) not in ('boolean', 'null') then
        raise exception 'invalid_running_boolean' using errcode = '22023';
      end if;
    elsif field_name in (
      'distance_meters', 'heart_rate_average_bpm', 'heart_rate_max_bpm',
      'heart_rate_sample_count', 'speed_average_meters_per_second',
      'speed_max_meters_per_second', 'speed_sample_count',
      'lap_count', 'segment_count'
    ) then
      if field_value = 'null'::jsonb then
        continue;
      end if;
      if pg_catalog.jsonb_typeof(field_value) <> 'number' then
        raise exception 'invalid_running_number: %', field_name using errcode = '22023';
      end if;
      if field_value::numeric < 0 then
        raise exception 'negative_running_number: %', field_name using errcode = '22023';
      end if;
      if field_name in ('heart_rate_sample_count', 'speed_sample_count', 'lap_count', 'segment_count')
        and field_value::numeric <> pg_catalog.trunc(field_value::numeric) then
        raise exception 'invalid_running_count: %', field_name using errcode = '22023';
      end if;
    else
      raise exception 'unknown_running_data_field: %', field_name using errcode = '22023';
    end if;
  end loop;

  return query
  insert into public.running_sessions as stored (
    user_id, source, source_package, source_record_id, started_at, ended_at, data
  ) values (
    owner_id, 'health_connect', p_session->>'source_package',
    p_session->>'source_record_id', start_instant, end_instant, session_data
  )
  on conflict (user_id, source, source_package, source_record_id)
  do update set
    started_at = excluded.started_at,
    ended_at = excluded.ended_at,
    data = stored.data || excluded.data,
    updated_at = pg_catalog.clock_timestamp()
  returning stored.*;
end;
$$;

revoke all on function aptus_private.upsert_my_running_session(jsonb)
  from public, anon, authenticated;

create function public.upsert_my_running_session(p_session jsonb)
returns setof public.running_sessions
language sql
security definer
set search_path = ''
as $$
  select * from aptus_private.upsert_my_running_session(p_session);
$$;

revoke all on function public.upsert_my_running_session(jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_my_running_session(jsonb)
  to authenticated;

notify pgrst, 'reload schema';
commit;
