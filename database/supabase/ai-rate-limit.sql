create table if not exists public.ai_daily_usage (
  user_id uuid not null,
  usage_date date not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),

  primary key (
    user_id,
    usage_date
  ),

  constraint ai_daily_usage_request_count_nonnegative
    check (request_count >= 0)
);

alter table public.ai_daily_usage
enable row level security;


create or replace function public.consume_ai_daily_quota(
  p_limit integer
)
returns table (
  allowed boolean,
  request_count integer,
  request_limit integer
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null then
    raise exception
      'not_authenticated'
      using errcode = '28000';
  end if;

  if p_limit is null or p_limit < 1 then
    raise exception
      'invalid_limit'
      using errcode = '22023';
  end if;

  insert into public.ai_daily_usage as usage (
    user_id,
    usage_date,
    request_count,
    updated_at
  )
  values (
    v_user_id,
    current_date,
    1,
    now()
  )
  on conflict (
    user_id,
    usage_date
  )
  do update
  set
    request_count =
      usage.request_count + 1,
    updated_at =
      now()
  where
    usage.request_count < p_limit
  returning
    usage.request_count
  into v_count;

  if found then
    return query
    select
      true,
      v_count,
      p_limit;

    return;
  end if;

  select usage.request_count
  into v_count
  from public.ai_daily_usage as usage
  where
    usage.user_id = v_user_id
    and usage.usage_date =
      current_date;

  return query
  select
    false,
    coalesce(
      v_count,
      p_limit
    ),
    p_limit;
end;
$$;


revoke all
on table public.ai_daily_usage
from public, anon, authenticated;

revoke all
on function public.consume_ai_daily_quota(integer)
from public, anon;

grant execute
on function public.consume_ai_daily_quota(integer)
to authenticated;
