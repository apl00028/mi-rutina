begin;

drop policy if exists gymos_users_insert_own_self_service
  on public.gymos_users;

create policy gymos_users_insert_own_self_service
  on public.gymos_users
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and role in ('user', 'trainer')
    and status = 'active'
    and plan = 'free'
    and expires_at is null
  );

commit;

notify pgrst, 'reload schema';
