-- Aptus production security hardening.

-- Trigger function: it must not be directly callable through the API.
revoke all
on function public.handle_new_gymos_user()
from public, anon, authenticated;

-- Admin helper is required by authenticated-user RLS policies,
-- but must not be exposed to anonymous callers.
revoke all
on function public.is_gymos_admin()
from public, anon;

grant execute
on function public.is_gymos_admin()
to authenticated;

-- Harden the daily health trigger against mutable search_path.
alter function public.set_health_daily_checkins_updated_at()
set search_path = '';

-- Keep trigger/helper ownership access explicit.
grant execute
on function public.handle_new_gymos_user()
to service_role;
