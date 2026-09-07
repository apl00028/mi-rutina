-- Phase 1A. Apply after schema.sql, account-profile.sql and trainer-athletes.sql.
-- No remote execution is performed by the tests. See companion documentation.
begin;

create table public.connection_contact_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trainer_athlete_invitations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('pending', 'accepted', 'expired', 'revoked')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  check (trainer_id <> athlete_id),
  check (inviter_id in (trainer_id, athlete_id)),
  check (expires_at > created_at),
  check (revoked_by is null or revoked_by in (trainer_id, athlete_id)),
  check (
    (status in ('pending', 'expired') and accepted_at is null and revoked_at is null and revoked_by is null)
    or (status = 'accepted' and accepted_at is not null and revoked_at is null and revoked_by is null)
    or (status = 'revoked' and accepted_at is null and revoked_at is not null and revoked_by is not null)
  )
);

create unique index trainer_athlete_invitations_pending_pair_idx
  on public.trainer_athlete_invitations(trainer_id, athlete_id) where status = 'pending';
create index trainer_athlete_invitations_sent_idx
  on public.trainer_athlete_invitations(inviter_id, created_at desc, id);
create index trainer_athlete_invitations_received_idx
  on public.trainer_athlete_invitations(
    (case when inviter_id = trainer_id then athlete_id else trainer_id end), created_at desc, id
  );

alter table public.connection_contact_codes enable row level security;
alter table public.trainer_athlete_invitations enable row level security;
revoke all on public.connection_contact_codes, public.trainer_athlete_invitations
  from public, anon, authenticated;
-- Deliberately no policies: clients access these tables only through the RPCs.
create schema if not exists aptus_private;
revoke all on schema aptus_private from public, anon, authenticated;

create function aptus_private.connection_actor_role()
returns text language plpgsql security definer set search_path = '' as $$
declare actor_role text;
begin
  select u.role into actor_role from public.gymos_users u
  where u.user_id = auth.uid() and u.role in ('user', 'trainer')
    and u.status = 'active' and (u.expires_at is null or u.expires_at > clock_timestamp());
  if not found then
    raise exception 'connection_actor_not_authorized' using errcode = '42501';
  end if;
  return actor_role;
end;
$$;

create function aptus_private.set_my_connection_contact_code(p_code_hash text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform aptus_private.connection_actor_role();
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_contact_code_hash' using errcode = '22023';
  end if;
  insert into public.connection_contact_codes(user_id, code_hash)
  values (auth.uid(), p_code_hash)
  on conflict (user_id) do update
    set code_hash = excluded.code_hash, updated_at = clock_timestamp();
exception when unique_violation then
  -- Do not expose a conflicting hash through PostgreSQL's constraint DETAIL.
  raise exception 'contact_code_conflict' using errcode = '23505';
end;
$$;

create function aptus_private.create_trainer_athlete_invitation(
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
    or (not p_trainer_invites and actor_role <> 'user') then
    raise exception 'connection_actor_not_authorized' using errcode = '42501';
  end if;
  if p_contact_code_hash is null or p_contact_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invitation_target_unavailable' using errcode = '22023';
  end if;
  select c.user_id into target
  from public.connection_contact_codes c join public.gymos_users u on u.user_id = c.user_id
  where c.code_hash = p_contact_code_hash and c.user_id <> actor
    and u.role = case when p_trainer_invites then 'user' else 'trainer' end
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

create function aptus_private.transition_trainer_athlete_invitation(p_invitation_id uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  invitation public.trainer_athlete_invitations%rowtype;
  recipient uuid;
  changed uuid;
begin
  perform aptus_private.connection_actor_role();
  select * into invitation from public.trainer_athlete_invitations
  where id = p_invitation_id for update;
  recipient := case when invitation.inviter_id = invitation.trainer_id
    then invitation.athlete_id else invitation.trainer_id end;
  if not found or (p_action = 'revoke' and actor <> invitation.inviter_id)
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
      and u.role = 'user' and u.status = 'active'
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

create function aptus_private.list_my_trainer_athlete_invitations(p_sent boolean)
returns table (
  id uuid, trainer_id uuid, athlete_id uuid, inviter_id uuid, recipient_id uuid,
  direction text, status text, created_at timestamptz, expires_at timestamptz,
  accepted_at timestamptz, revoked_at timestamptz, revoked_by uuid,
  other_display_name text, other_alias text
)
language plpgsql security definer set search_path = '' as $$
begin
  perform aptus_private.connection_actor_role();
  return query
  select i.id, i.trainer_id, i.athlete_id, i.inviter_id,
    case when i.inviter_id = i.trainer_id then i.athlete_id else i.trainer_id end,
    case when i.inviter_id = i.trainer_id then 'trainer_to_athlete' else 'athlete_to_trainer' end,
    case when i.status = 'pending' and i.expires_at <= clock_timestamp() then 'expired' else i.status end,
    i.created_at, i.expires_at, i.accepted_at, i.revoked_at, i.revoked_by,
    p.display_name, p.alias
  from public.trainer_athlete_invitations i
  left join public.profiles p on p.id = case when i.trainer_id = auth.uid() then i.athlete_id else i.trainer_id end
  where (p_sent and i.inviter_id = auth.uid())
    or (not p_sent and (case when i.inviter_id = i.trainer_id then i.athlete_id else i.trainer_id end) = auth.uid())
  order by i.created_at desc, i.id;
end;
$$;

create function public.set_my_connection_contact_code(p_code_hash text)
returns void
language sql security definer set search_path = '' as $$
  select aptus_private.set_my_connection_contact_code(p_code_hash);
$$;

revoke all on function public.set_my_connection_contact_code(text) from public, anon, authenticated;
grant execute on function public.set_my_connection_contact_code(text) to authenticated;

create function public.trainer_create_athlete_invitation(p_contact_code_hash text, p_token_hash text)
returns uuid
language sql security definer set search_path = '' as $$
  select aptus_private.create_trainer_athlete_invitation(p_contact_code_hash, p_token_hash, true);
$$;

revoke all on function public.trainer_create_athlete_invitation(text, text) from public, anon, authenticated;
grant execute on function public.trainer_create_athlete_invitation(text, text) to authenticated;

create function public.athlete_create_trainer_invitation(p_contact_code_hash text, p_token_hash text)
returns uuid
language sql security definer set search_path = '' as $$
  select aptus_private.create_trainer_athlete_invitation(p_contact_code_hash, p_token_hash, false);
$$;

revoke all on function public.athlete_create_trainer_invitation(text, text) from public, anon, authenticated;
grant execute on function public.athlete_create_trainer_invitation(text, text) to authenticated;

create function public.list_my_received_trainer_athlete_invitations()
returns table (
  id uuid, trainer_id uuid, athlete_id uuid, inviter_id uuid, recipient_id uuid,
  direction text, status text, created_at timestamptz, expires_at timestamptz,
  accepted_at timestamptz, revoked_at timestamptz, revoked_by uuid,
  other_display_name text, other_alias text
)
language sql security definer set search_path = '' as $$
  select * from aptus_private.list_my_trainer_athlete_invitations(false);
$$;

revoke all on function public.list_my_received_trainer_athlete_invitations() from public, anon, authenticated;
grant execute on function public.list_my_received_trainer_athlete_invitations() to authenticated;

create function public.list_my_sent_trainer_athlete_invitations()
returns table (
  id uuid, trainer_id uuid, athlete_id uuid, inviter_id uuid, recipient_id uuid,
  direction text, status text, created_at timestamptz, expires_at timestamptz,
  accepted_at timestamptz, revoked_at timestamptz, revoked_by uuid,
  other_display_name text, other_alias text
)
language sql security definer set search_path = '' as $$
  select * from aptus_private.list_my_trainer_athlete_invitations(true);
$$;

revoke all on function public.list_my_sent_trainer_athlete_invitations() from public, anon, authenticated;
grant execute on function public.list_my_sent_trainer_athlete_invitations() to authenticated;

create function public.accept_trainer_athlete_invitation(p_invitation_id uuid)
returns void
language sql security definer set search_path = '' as $$
  select aptus_private.transition_trainer_athlete_invitation(p_invitation_id, 'accept');
$$;

revoke all on function public.accept_trainer_athlete_invitation(uuid) from public, anon, authenticated;
grant execute on function public.accept_trainer_athlete_invitation(uuid) to authenticated;

create function public.reject_trainer_athlete_invitation(p_invitation_id uuid)
returns void
language sql security definer set search_path = '' as $$
  select aptus_private.transition_trainer_athlete_invitation(p_invitation_id, 'reject');
$$;

revoke all on function public.reject_trainer_athlete_invitation(uuid) from public, anon, authenticated;
grant execute on function public.reject_trainer_athlete_invitation(uuid) to authenticated;

create function public.revoke_trainer_athlete_invitation(p_invitation_id uuid)
returns void
language sql security definer set search_path = '' as $$
  select aptus_private.transition_trainer_athlete_invitation(p_invitation_id, 'revoke');
$$;

revoke all on function public.revoke_trainer_athlete_invitation(uuid) from public, anon, authenticated;
grant execute on function public.revoke_trainer_athlete_invitation(uuid) to authenticated;

revoke all on function aptus_private.connection_actor_role() from public, anon, authenticated;

revoke all on function aptus_private.set_my_connection_contact_code(text) from public, anon, authenticated;

revoke all on function aptus_private.create_trainer_athlete_invitation(text, text, boolean) from public, anon, authenticated;

revoke all on function aptus_private.transition_trainer_athlete_invitation(uuid, text) from public, anon, authenticated;

revoke all on function aptus_private.list_my_trainer_athlete_invitations(boolean) from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
