-- GymOS sync v2 lockdown.
-- Phase B: deploy only after the RPC-compatible client is published.
-- This phase blocks cached legacy clients from direct writes to gymos_sync.

alter table public.gymos_sync enable row level security;

drop policy if exists "Users can read their own GymOS data" on public.gymos_sync;
create policy "Users can read their own GymOS data"
on public.gymos_sync for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own GymOS data" on public.gymos_sync;
drop policy if exists "Users can update their own GymOS data" on public.gymos_sync;
drop policy if exists "Users can delete their own GymOS data" on public.gymos_sync;

revoke insert, update, delete on table public.gymos_sync from anon, authenticated;
grant select on table public.gymos_sync to authenticated;
