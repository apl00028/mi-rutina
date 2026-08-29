alter table public.active_routines
  add column if not exists discipline text;

update public.active_routines ar
set discipline = coalesce(
  nullif(r.data->>'discipline', ''),
  'strength'
)
from public.routines r
where r.user_id = ar.user_id
  and r.id = ar.routine_id
  and ar.discipline is null;

alter table public.active_routines
  alter column discipline set not null;

alter table public.active_routines
  drop constraint if exists active_routines_pkey;

alter table public.active_routines
  add constraint active_routines_pkey
  primary key (user_id, discipline);

create index if not exists
  active_routines_user_discipline_idx
on public.active_routines(
  user_id,
  discipline
);
