from pathlib import Path


def sql() -> str:
    return (
        Path(__file__).resolve().parents[2]
        / "database"
        / "supabase"
        / "goals.sql"
    ).read_text(encoding="utf-8").lower()


def test_goal_schema_has_minimal_fields_and_constraints():
    source = sql()
    goals_table = source.split(
        "create table if not exists public.goal_metrics"
    )[0]
    assert "create table if not exists public.goals" in source
    assert "id uuid primary key default gen_random_uuid()" in source
    assert "user_id uuid not null" in source
    assert "references auth.users(id) on delete cascade" in source
    assert "target_date date null" in source
    assert "created_by_user_id uuid null" in source
    assert "created_at timestamptz not null" in source
    assert "updated_at timestamptz not null" in source
    assert "baseline" not in goals_table
    assert "current_value" not in goals_table
    assert "progress" not in goals_table
    assert "target_value" not in goals_table
    assert "plan_id" not in goals_table


def test_one_active_goal_is_a_database_invariant():
    source = sql()
    assert "create unique index if not exists" in source
    assert "goals_one_active_per_user_idx" in source
    assert "on public.goals (user_id)" in source
    assert "where status = 'active'" in source


def test_goal_rls_is_owner_only_without_delete():
    source = sql()
    assert "enable row level security" in source
    assert "goals_select_own" in source
    assert "goals_insert_own" in source
    assert "goals_update_own" in source
    assert "(select auth.uid()) = user_id" in source
    assert "(select auth.uid()) = created_by_user_id" in source
    assert "gymos_users.role in ('user', 'admin')" in source
    assert "grant select, insert, update" in source
    assert "create policy goals_delete" not in source
    assert "grant delete" not in source


def test_taxonomy_and_status_are_also_bounded_in_sql():
    source = sql()
    assert "goals_status_check" in source
    assert "goals_category_kind_check" in source
    assert "goals_variant_check" in source
    for value in (
        "general_health",
        "recomposition",
        "strength_gain",
        "triathlon",
        "sport_performance",
        "half_marathon",
        "olympic",
    ):
        assert f"'{value}'" in source


def test_updated_at_uses_a_trigger():
    source = sql()
    assert "security invoker" in source
    assert "set search_path = ''" in source
    assert "before update on public.goals" in source
    assert "new.updated_at = pg_catalog.now()" in source
