from pathlib import Path
import re


def _sql() -> str:
    return (
        Path(__file__).resolve().parents[2]
        / "database"
        / "supabase"
        / "trainer-athlete-overview.sql"
    ).read_text(encoding="utf-8").lower()


def test_overview_rpc_signature_and_minimal_columns():
    sql = _sql()

    assert (
        "create function public.trainer_get_athlete_overview(\n"
        "  p_athlete_id uuid\n"
        ")"
    ) in sql
    assert "p_trainer_id" not in sql
    assert (
        "returns table (\n"
        "  athlete_id uuid,\n"
        "  status text,\n"
        "  email text,\n"
        "  display_name text,\n"
        "  client_since timestamptz,\n"
        "  health jsonb,\n"
        "  recent_training jsonb,\n"
        "  active_routines jsonb,\n"
        "  trainer jsonb\n"
        ")"
    ) in sql
    assert "alias" not in sql
    assert "plan" not in sql
    assert "metadata" not in sql


def test_overview_rpc_security_boundary():
    sql = _sql()

    assert "security definer" in sql
    assert "set search_path = ''" in sql
    assert "dynamic sql" not in sql
    assert "selectauth.uid" not in sql
    assert "current_trainer.user_id = (select auth.uid())" in sql
    assert "current_trainer.role = 'trainer'" in sql
    assert "current_trainer.status = 'active'" in sql
    assert "trainer_athletes.trainer_id = (select auth.uid())" in sql
    assert "trainer_athletes.athlete_id = p_athlete_id" in sql
    assert "trainer_athletes.status = 'active'" in sql


def test_overview_rpc_reads_only_real_overview_sources():
    sql = _sql()

    for source in [
        "from public.trainer_athletes",
        "left join public.gymos_users as athlete_users",
        "left join public.profiles",
        "from public.health_weight_entries",
        "from public.health_body_measurements",
        "from public.workouts",
        "from public.routines",
        "from public.active_routines",
        "from public.trainer_routine_assignments",
    ]:
        assert source in sql

    assert "trainer_athletes.created_at as client_since" in sql
    assert "athlete_users.email" in sql
    assert "profiles.display_name" in sql
    assert "'weight_measurement_date'" in sql
    assert "'waist_measurement_date'" in sql
    assert "health_weight_entries.weight_kg" in sql
    assert "health_body_measurements.waist_cm" in sql
    assert "workouts.data->>'status' = 'finished'" in sql
    assert "completed_last_7_days" in sql
    assert "session->>'name'" in sql
    assert "session->>'title'" in sql
    assert "routines.data->>'name'" in sql
    assert "trainer_routine_templates.name as template_name" in sql


def test_overview_rpc_returns_all_active_routine_disciplines_explicitly():
    sql = _sql()

    assert "jsonb_object_agg" not in sql
    assert "'strength',\n      active_routine_rows.strength" in sql
    assert "'swimming',\n      active_routine_rows.swimming" in sql
    assert "'running',\n      active_routine_rows.running" in sql
    assert "'cycling',\n      active_routine_rows.cycling" in sql

    for discipline in [
        "strength",
        "swimming",
        "running",
        "cycling",
    ]:
        assert (
            "active_routines.discipline = "
            f"'{discipline}'"
        ) in sql

    assert "'name',\n          routines.data->>'name'" in sql


def test_overview_rpc_privileges_and_schema_reload():
    sql = _sql()

    assert (
        "revoke all\n"
        "on function public.trainer_get_athlete_overview(uuid)\n"
        "from public, anon"
    ) in sql
    assert (
        "grant execute\n"
        "on function public.trainer_get_athlete_overview(uuid)\n"
        "to authenticated"
    ) in sql
    assert "notify pgrst, 'reload schema';" in sql


def test_overview_rpc_has_no_write_or_policy_changes():
    sql = _sql()

    assert "create policy" not in sql
    assert "alter table" not in sql
    assert re.search(r"\binsert\b|\bupdate\b|\bdelete\b", sql) is None
