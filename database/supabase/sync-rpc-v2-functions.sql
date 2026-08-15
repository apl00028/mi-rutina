-- GymOS sync v2 server-side functions.
-- Phase A: deploy this before publishing the RPC-compatible client.
-- This phase does not remove legacy INSERT/UPDATE/DELETE policies yet.

create or replace function public.gymos_sync_compare_and_swap(
  expected_revision bigint,
  expected_checksum text,
  new_revision bigint,
  new_device_id text,
  new_checksum text,
  new_payload jsonb
)
returns table(success boolean, conflict boolean, revision bigint, checksum text)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_user_id uuid := auth.uid();
  written_revision bigint;
  written_checksum text;
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if expected_revision is null or expected_revision < 0 then
    raise exception 'sync_protocol_error' using errcode = '22023';
  end if;

  if new_revision is null or new_revision <> expected_revision + 1 then
    raise exception 'sync_protocol_error' using errcode = '22023';
  end if;

  if new_payload is null then
    raise exception 'sync_protocol_error' using errcode = '22023';
  end if;

  if expected_revision = 0 then
    if new_revision <> 1 or expected_checksum is not null then
      raise exception 'sync_protocol_error' using errcode = '22023';
    end if;

    insert into public.gymos_sync as sync_row (
      user_id, payload, revision, device_id, checksum, updated_at
    )
    values (
      current_user_id, new_payload, new_revision, new_device_id, new_checksum, pg_catalog.now()
    )
    on conflict (user_id) do nothing
    returning sync_row.revision, sync_row.checksum
    into written_revision, written_checksum;

    if found then
      return query select true, false, written_revision, written_checksum;
      return;
    end if;

    select sync_row.revision, sync_row.checksum
    into written_revision, written_checksum
    from public.gymos_sync as sync_row
    where sync_row.user_id = current_user_id;

    return query select false, true, written_revision, written_checksum;
    return;
  end if;

  if expected_checksum is null then
    raise exception 'sync_protocol_error' using errcode = '22023';
  end if;

  update public.gymos_sync as sync_row
  set
    payload = new_payload,
    revision = new_revision,
    device_id = new_device_id,
    checksum = new_checksum,
    updated_at = pg_catalog.now()
  where sync_row.user_id = current_user_id
    and sync_row.revision = expected_revision
    and sync_row.checksum = expected_checksum
  returning sync_row.revision, sync_row.checksum
  into written_revision, written_checksum;

  if found then
    return query select true, false, written_revision, written_checksum;
    return;
  end if;

  select sync_row.revision, sync_row.checksum
  into written_revision, written_checksum
  from public.gymos_sync as sync_row
  where sync_row.user_id = current_user_id;

  return query select false, true, written_revision, written_checksum;
end;
$$;

create or replace function public.gymos_sync_delete_own()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  delete from public.gymos_sync as sync_row
  where sync_row.user_id = current_user_id;

  return true;
end;
$$;

revoke all on function public.gymos_sync_compare_and_swap(bigint,text,bigint,text,text,jsonb) from public;
revoke all on function public.gymos_sync_compare_and_swap(bigint,text,bigint,text,text,jsonb) from anon;
revoke all on function public.gymos_sync_delete_own() from public;
revoke all on function public.gymos_sync_delete_own() from anon;
grant execute on function public.gymos_sync_compare_and_swap(bigint,text,bigint,text,text,jsonb) to authenticated;
grant execute on function public.gymos_sync_delete_own() to authenticated;
