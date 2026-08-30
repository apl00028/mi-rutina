-- Run after active-routines-by-discipline.sql on existing installations.
-- Legacy routines without data.discipline are intentionally treated as strength.

alter table public.routines
  add column if not exists discipline text generated always as (
    coalesce(nullif(data->>'discipline', ''), 'strength')
  ) stored;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.routines'::regclass
      and conname = 'routines_discipline_check'
  ) then
    alter table public.routines
      add constraint routines_discipline_check
      check (discipline in ('strength', 'swimming', 'cycling', 'running'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.routines'::regclass
      and conname = 'routines_user_id_id_discipline_key'
  ) then
    alter table public.routines
      add constraint routines_user_id_id_discipline_key
      unique (user_id, id, discipline);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.active_routines'::regclass
      and conname = 'active_routines_discipline_check'
  ) then
    alter table public.active_routines
      add constraint active_routines_discipline_check
      check (discipline in ('strength', 'swimming', 'cycling', 'running'));
  end if;
end
$$;

-- Invalid active links are unusable by the API and cannot satisfy the new FK.
-- Removing only those links lets the user explicitly reactivate the right routine.
delete from public.active_routines ar
using public.routines r
where r.user_id = ar.user_id
  and r.id = ar.routine_id
  and ar.discipline <> r.discipline;

alter table public.active_routines
  drop constraint if exists active_routines_routine_fk;

alter table public.active_routines
  add constraint active_routines_routine_fk
  foreign key (user_id, routine_id, discipline)
  references public.routines(user_id, id, discipline)
  on delete cascade;
