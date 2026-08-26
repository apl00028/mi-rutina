create or replace function public.delete_aptus_user_data(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.account_deletion_requests
  where user_id = p_user_id;

  delete from public.active_routines
  where user_id = p_user_id;

  delete from public.ai_daily_usage
  where user_id = p_user_id;

  delete from public.nutrition_meal_completions
  where user_id = p_user_id;

  delete from public.custom_exercises
  where user_id = p_user_id;

  delete from public.daily_recovery
  where user_id = p_user_id;

  delete from public.gymos_sync
  where user_id = p_user_id;

  delete from public.health_body_measurements
  where user_id = p_user_id;

  delete from public.health_daily_checkins
  where user_id = p_user_id;

  delete from public.health_weekly_checkins
  where user_id = p_user_id;

  delete from public.health_weight_entries
  where user_id = p_user_id;

  delete from public.recovery_checkins
  where user_id = p_user_id;

  delete from public.sync_audit
  where user_id = p_user_id;

  delete from public.workouts
  where user_id = p_user_id;

  delete from public.nutrition_plans
  where user_id = p_user_id;

  delete from public.routines
  where user_id = p_user_id;

  delete from public.training_profiles
  where user_id = p_user_id;

  delete from public.gymos_users
  where user_id = p_user_id;
end;
$$;

revoke all
on function public.delete_aptus_user_data(uuid)
from public, anon, authenticated;

grant execute
on function public.delete_aptus_user_data(uuid)
to service_role;
