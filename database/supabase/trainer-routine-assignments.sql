-- Trainer template assignments to athlete-owned routines.
-- Run this once in the Supabase SQL Editor.

create table if not exists public.trainer_routine_assignments (
  id uuid primary key
    default gen_random_uuid(),

  trainer_id uuid not null
    references auth.users(id)
    on delete cascade,

  athlete_id uuid not null
    references auth.users(id)
    on delete cascade,

  template_id text not null,

  routine_id text not null,

  discipline text not null
    check (
      discipline in (
        'strength',
        'swimming',
        'cycling',
        'running'
      )
    ),

  assigned_at timestamptz not null
    default now(),

  constraint trainer_routine_assignments_template_fk
    foreign key (trainer_id, template_id)
    references public.trainer_routine_templates(trainer_id, id)
    on delete restrict,

  constraint trainer_routine_assignments_routine_fk
    foreign key (athlete_id, routine_id, discipline)
    references public.routines(user_id, id, discipline)
    on delete cascade,

  constraint trainer_routine_assignments_athlete_routine_key
    unique (athlete_id, routine_id)
);


create index if not exists
  trainer_routine_assignments_trainer_assigned_at_idx
  on public.trainer_routine_assignments(
    trainer_id,
    assigned_at desc
  );

create index if not exists
  trainer_routine_assignments_athlete_assigned_at_idx
  on public.trainer_routine_assignments(
    athlete_id,
    assigned_at desc
  );

create index if not exists
  trainer_routine_assignments_trainer_athlete_idx
  on public.trainer_routine_assignments(
    trainer_id,
    athlete_id
  );


alter table public.trainer_routine_assignments
  enable row level security;


drop policy if exists
  "Trainers can read their routine assignments"
  on public.trainer_routine_assignments;

create policy
  "Trainers can read their routine assignments"
  on public.trainer_routine_assignments
  for select
  to authenticated
  using (
    (select auth.uid()) = trainer_id
    and exists (
      select 1
      from public.gymos_users
      where gymos_users.user_id = (select auth.uid())
        and gymos_users.role = 'trainer'
        and gymos_users.status = 'active'
    )
  );


drop policy if exists
  "Athletes can read their routine assignments"
  on public.trainer_routine_assignments;

create policy
  "Athletes can read their routine assignments"
  on public.trainer_routine_assignments
  for select
  to authenticated
  using (
    (select auth.uid()) = athlete_id
  );


drop policy if exists
  "Trainers can create routine assignments"
  on public.trainer_routine_assignments;
drop policy if exists
  "Trainers can update routine assignments"
  on public.trainer_routine_assignments;
drop policy if exists
  "Trainers can delete routine assignments"
  on public.trainer_routine_assignments;


drop function if exists public.trainer_assign_routine_template(
  uuid,
  text,
  text,
  text,
  jsonb,
  timestamptz
);

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
