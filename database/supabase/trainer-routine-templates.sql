-- Trainer-owned reusable routine templates.
-- Run this once in the Supabase SQL Editor.

create table if not exists public.trainer_routine_templates (
  id text not null
    check (id = btrim(id) and char_length(id) > 0),

  trainer_id uuid not null
    references auth.users(id)
    on delete cascade,

  name text not null
    check (name = btrim(name) and char_length(name) > 0),

  discipline text not null
    check (
      discipline in (
        'strength',
        'swimming',
        'cycling',
        'running'
      )
    ),

  data jsonb not null
    default '{}'::jsonb,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  primary key (trainer_id, id)
);


create index if not exists
  trainer_routine_templates_trainer_updated_at_idx
  on public.trainer_routine_templates(
    trainer_id,
    updated_at desc
  );

create index if not exists
  trainer_routine_templates_trainer_discipline_idx
  on public.trainer_routine_templates(
    trainer_id,
    discipline
  );


alter table public.trainer_routine_templates
  enable row level security;


drop policy if exists
  "Trainers can read their own routine templates"
  on public.trainer_routine_templates;

create policy
  "Trainers can read their own routine templates"
  on public.trainer_routine_templates
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
  "Trainers can create their own routine templates"
  on public.trainer_routine_templates;

create policy
  "Trainers can create their own routine templates"
  on public.trainer_routine_templates
  for insert
  to authenticated
  with check (
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
  "Trainers can update their own routine templates"
  on public.trainer_routine_templates;

create policy
  "Trainers can update their own routine templates"
  on public.trainer_routine_templates
  for update
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
  )
  with check (
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
  "Trainers can delete their own routine templates"
  on public.trainer_routine_templates;

create policy
  "Trainers can delete their own routine templates"
  on public.trainer_routine_templates
  for delete
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
