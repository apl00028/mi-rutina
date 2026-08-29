create table if not exists public.swimming_sessions (
  id text not null check (char_length(trim(id)) > 0),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  source text not null
    check (
      source in (
        'garmin_fit',
        'health_connect',
        'garmin_api'
      )
    ),

  source_file_hash text
    check (
      source_file_hash is null
      or char_length(source_file_hash) = 64
    ),

  started_at timestamptz not null,

  parser_version integer not null
    default 1
    check (parser_version >= 1),

  data jsonb not null
    default '{}'::jsonb,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  primary key (user_id, id)
);


create unique index if not exists
  swimming_sessions_user_source_hash_uidx
  on public.swimming_sessions(
    user_id,
    source_file_hash
  )
  where source_file_hash is not null;


create index if not exists
  swimming_sessions_user_started_at_idx
  on public.swimming_sessions(
    user_id,
    started_at desc
  );


alter table public.swimming_sessions
  enable row level security;


drop policy if exists
  "Users can read their own swimming sessions"
  on public.swimming_sessions;

create policy
  "Users can read their own swimming sessions"
  on public.swimming_sessions
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
  );


drop policy if exists
  "Users can create their own swimming sessions"
  on public.swimming_sessions;

create policy
  "Users can create their own swimming sessions"
  on public.swimming_sessions
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
  );


drop policy if exists
  "Users can update their own swimming sessions"
  on public.swimming_sessions;

create policy
  "Users can update their own swimming sessions"
  on public.swimming_sessions
  for update
  to authenticated
  using (
    (select auth.uid()) = user_id
  )
  with check (
    (select auth.uid()) = user_id
  );


drop policy if exists
  "Users can delete their own swimming sessions"
  on public.swimming_sessions;

create policy
  "Users can delete their own swimming sessions"
  on public.swimming_sessions
  for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
  );
