-- GymOS v3.8.0 RLS isolation check
select auth.uid() as current_user;
select user_id, revision, updated_at from public.gymos_sync where user_id = auth.uid();
-- Under RLS, this must return zero rows:
select user_id, revision, updated_at from public.gymos_sync where user_id <> auth.uid();
