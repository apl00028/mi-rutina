begin;

create table if not exists public.user_integrations (
  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  provider text not null,

  enabled boolean not null default true,

  connected_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  primary key (user_id, provider),

  constraint user_integrations_provider_check
    check (provider in ('health_connect'))
);

alter table public.user_integrations
  enable row level security;

grant select, insert, update, delete
  on public.user_integrations
  to authenticated;

drop policy if exists
  user_integrations_select_own
  on public.user_integrations;

create policy user_integrations_select_own
  on public.user_integrations
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
  );

drop policy if exists
  user_integrations_insert_own
  on public.user_integrations;

create policy user_integrations_insert_own
  on public.user_integrations
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and provider = 'health_connect'
    and enabled = true
  );

drop policy if exists
  user_integrations_update_own
  on public.user_integrations;

create policy user_integrations_update_own
  on public.user_integrations
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
  )
  with check (
    user_id = (select auth.uid())
    and provider = 'health_connect'
  );

drop policy if exists
  user_integrations_delete_own
  on public.user_integrations;

create policy user_integrations_delete_own
  on public.user_integrations
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
  );

commit;

notify pgrst, 'reload schema';
