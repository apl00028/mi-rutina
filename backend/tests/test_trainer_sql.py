import re
from pathlib import Path


def _trainer_sql() -> str:
    return (
        Path(__file__).resolve().parents[2]
        / "database"
        / "supabase"
        / "trainer-athletes.sql"
    ).read_text(encoding="utf-8").lower()


def test_trainer_athletes_sql_creates_table_constraints_and_indexes():
    sql = _trainer_sql()

    assert "create table if not exists public.trainer_athletes" in sql
    assert "trainer_id uuid not null" in sql
    assert "athlete_id uuid not null" in sql
    assert sql.count("references auth.users(id)") >= 2
    assert "primary key (trainer_id, athlete_id)" in sql
    assert "check (trainer_id <> athlete_id)" in sql
    assert "status text not null" in sql
    assert "default 'active'" in sql
    assert "status in (\n        'active',\n        'inactive'" in sql
    assert "trainer_athletes_trainer_id_idx" in sql
    assert "trainer_athletes_athlete_id_idx" in sql


def test_trainer_athletes_sql_enables_rls_with_read_only_policies():
    sql = _trainer_sql()

    assert (
        "alter table public.trainer_athletes\n"
        "  enable row level security"
    ) in sql
    assert "for select" in sql
    assert "to authenticated" in sql
    assert "(select auth.uid()) = trainer_id" in sql
    assert "(select auth.uid()) = athlete_id" in sql
    assert "from public.gymos_users" in sql
    assert "gymos_users.user_id = (select auth.uid())" in sql
    assert "gymos_users.role = 'trainer'" in sql
    assert "gymos_users.status = 'active'" in sql

    created_policy_statements = re.findall(
        r"create policy.*?;",
        sql,
        flags=re.S,
    )

    assert created_policy_statements
    assert all(
        "for select" in policy
        for policy in created_policy_statements
    )
    assert all(
        operation not in " ".join(created_policy_statements)
        for operation in (
            "for insert",
            "for update",
            "for delete",
            "for all",
        )
    )


def test_trainer_select_policy_validates_active_trainer_role():
    sql = _trainer_sql()
    trainer_policy = re.search(
        (
            r'create policy\s+'
            r'"trainers can read their athlete relationships"'
            r".*?;"
        ),
        sql,
        flags=re.S,
    )

    assert trainer_policy is not None
    policy_sql = trainer_policy.group(0)

    assert "(select auth.uid()) = trainer_id" in policy_sql
    assert "exists (" in policy_sql
    assert "from public.gymos_users" in policy_sql
    assert "gymos_users.user_id = (select auth.uid())" in policy_sql
    assert "gymos_users.role = 'trainer'" in policy_sql
    assert "gymos_users.status = 'active'" in policy_sql


def test_gymos_users_role_constraint_includes_trainer():
    sql = _trainer_sql()

    assert "drop constraint if exists gymos_users_role_check" in sql
    assert "add constraint gymos_users_role_check" in sql
    assert "role in ('user','trainer','admin')" in sql
