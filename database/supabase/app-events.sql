-- Aptus product telemetry.
--
-- Privacy rules:
-- - user_id always comes from auth.uid()
-- - no arbitrary event names
-- - metadata is intentionally small
-- - no health values, tokens, emails or request bodies


create table if not exists public.app_events (
  id bigint
    generated always as identity
    primary key,

  user_id uuid
    not null
    references auth.users(id)
    on delete cascade,

  event_name text
    not null,

  route text,

  platform text,

  app_version text,

  metadata jsonb
    not null
    default '{}'::jsonb,

  created_at timestamptz
    not null
    default now(),

  constraint app_events_name_length
    check (
      char_length(event_name)
      between 1 and 64
    ),

  constraint app_events_route_length
    check (
      route is null
      or char_length(route) <= 160
    ),

  constraint app_events_platform_length
    check (
      platform is null
      or char_length(platform) <= 32
    ),

  constraint app_events_version_length
    check (
      app_version is null
      or char_length(app_version) <= 32
    )
);


alter table public.app_events
enable row level security;


create index if not exists
app_events_user_created_idx
on public.app_events (
  user_id,
  created_at desc
);


create index if not exists
app_events_name_created_idx
on public.app_events (
  event_name,
  created_at desc
);


create or replace function public.record_app_event(
  p_event_name text,
  p_route text default null,
  p_platform text default null,
  p_app_version text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid :=
    auth.uid();

  v_event_id bigint;

  v_allowed_events constant text[] :=
    array[
      'page_view',
      'workout_started',
      'workout_completed',
      'coach_request',
      'health_connect_read',
      'health_connect_error'
    ];
begin
  if v_user_id is null then
    raise exception
      'not_authenticated'
      using errcode = '28000';
  end if;


  if not (
    p_event_name =
    any(v_allowed_events)
  ) then
    raise exception
      'invalid_event_name'
      using errcode = '22023';
  end if;


  if (
    p_route is not null
    and char_length(p_route) > 160
  ) then
    raise exception
      'invalid_route'
      using errcode = '22023';
  end if;


  if (
    p_platform is not null
    and char_length(p_platform) > 32
  ) then
    raise exception
      'invalid_platform'
      using errcode = '22023';
  end if;


  if (
    p_app_version is not null
    and char_length(p_app_version) > 32
  ) then
    raise exception
      'invalid_app_version'
      using errcode = '22023';
  end if;


  if (
    p_metadata is null
    or jsonb_typeof(p_metadata) <> 'object'
    or pg_column_size(p_metadata) > 2048
  ) then
    raise exception
      'invalid_metadata'
      using errcode = '22023';
  end if;


  insert into public.app_events (
    user_id,
    event_name,
    route,
    platform,
    app_version,
    metadata
  )
  values (
    v_user_id,
    p_event_name,
    p_route,
    p_platform,
    p_app_version,
    p_metadata
  )
  returning id
  into v_event_id;


  return v_event_id;
end;
$$;


-- Nobody can access the telemetry table
-- directly through PostgREST.

revoke all
on table public.app_events
from public, anon, authenticated;


-- Authenticated users may only call the
-- constrained telemetry function.

revoke all
on function public.record_app_event(
  text,
  text,
  text,
  text,
  jsonb
)
from public, anon;

grant execute
on function public.record_app_event(
  text,
  text,
  text,
  text,
  jsonb
)
to authenticated;
