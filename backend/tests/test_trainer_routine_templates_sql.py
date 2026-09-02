import re
from pathlib import Path


def _sql() -> str:
    return (
        Path(__file__).resolve().parents[2]
        / "database"
        / "supabase"
        / "trainer-routine-templates.sql"
    ).read_text(encoding="utf-8").lower()


def test_trainer_routine_templates_sql_creates_table_constraints_and_indexes():
    sql = _sql()

    assert "create table if not exists public.trainer_routine_templates" in sql
    assert "id text not null" in sql
    assert "trainer_id uuid not null" in sql
    assert "references auth.users(id)" in sql
    assert "name text not null" in sql
    assert "discipline text not null" in sql
    assert "data jsonb not null" in sql
    assert "default '{}'::jsonb" in sql
    assert "primary key (trainer_id, id)" in sql
    assert "check (id = btrim(id) and char_length(id) > 0)" in sql
    assert "check (name = btrim(name) and char_length(name) > 0)" in sql
    assert "'strength'" in sql
    assert "'swimming'" in sql
    assert "'cycling'" in sql
    assert "'running'" in sql
    assert "trainer_routine_templates_trainer_updated_at_idx" in sql
    assert "trainer_routine_templates_trainer_discipline_idx" in sql


def test_trainer_routine_templates_sql_enables_rls_without_athlete_access():
    sql = _sql()

    assert (
        "alter table public.trainer_routine_templates\n"
        "  enable row level security"
    ) in sql
    assert "athlete_id" not in sql


def test_template_policies_require_active_trainer_and_own_rows():
    sql = _sql()
    policies = re.findall(
        r"create policy.*?;",
        sql,
        flags=re.S,
    )

    assert len(policies) == 4

    for operation in (
        "for select",
        "for insert",
        "for update",
        "for delete",
    ):
        matching = [
            policy
            for policy in policies
            if operation in policy
        ]

        assert len(matching) == 1
        policy_sql = matching[0]
        assert "(select auth.uid()) = trainer_id" in policy_sql
        assert "from public.gymos_users" in policy_sql
        assert "gymos_users.user_id = (select auth.uid())" in policy_sql
        assert "gymos_users.role = 'trainer'" in policy_sql
        assert "gymos_users.status = 'active'" in policy_sql

    update_policy = next(
        policy
        for policy in policies
        if "for update" in policy
    )
    assert "with check" in update_policy
