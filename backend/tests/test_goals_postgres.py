"""Real Goal migration tests on disposable local PostgreSQL."""

import os
from pathlib import Path
import subprocess
from uuid import uuid4

import pytest


SQL_FILE = (
    Path(__file__).resolve().parents[2]
    / "database"
    / "supabase"
    / "goals.sql"
)
A = "00000000-0000-4000-8000-000000000001"
B = "00000000-0000-4000-8000-000000000002"
TRAINER = "00000000-0000-4000-8000-000000000003"


def literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


@pytest.fixture(scope="module")
def database():
    container = os.environ.get(
        "APTUS_TEST_POSTGRES_CONTAINER"
    )
    if not container:
        pytest.skip(
            "Set APTUS_TEST_POSTGRES_CONTAINER "
            "for local PostgreSQL tests"
        )

    database_name = "aptus_goals_test_" + uuid4().hex

    def execute(
        sql: str,
        *,
        db: str = database_name,
        role: str | None = None,
        user: str | None = None,
        error: str | None = None,
    ) -> str:
        prefix = ""
        if role:
            prefix += f"set role {role};\n"
        if user:
            prefix += (
                "set request.jwt.claim.sub = "
                f"{literal(user)};\n"
            )
        result = subprocess.run(
            [
                "docker",
                "exec",
                "-i",
                container,
                "psql",
                "-X",
                "-qAt",
                "-v",
                "ON_ERROR_STOP=1",
                "-v",
                "VERBOSITY=verbose",
                "-U",
                "postgres",
                "-d",
                db,
            ],
            input=prefix + sql,
            text=True,
            capture_output=True,
            timeout=30,
        )
        if error:
            assert result.returncode != 0
            assert error in result.stderr
        else:
            assert result.returncode == 0, result.stderr
        return result.stdout.strip()

    execute(
        f"create database {database_name};",
        db="postgres",
    )
    try:
        execute("""
            do $$ begin
              if not exists (
                select from pg_roles
                where rolname = 'authenticated'
              ) then
                create role authenticated nologin;
              end if;
              if not exists (
                select from pg_roles
                where rolname = 'anon'
              ) then
                create role anon nologin;
              end if;
            end $$;
            create schema auth;
            create table auth.users (id uuid primary key);
            create table public.gymos_users (
              user_id uuid primary key references auth.users(id),
              role text not null,
              status text not null
            );
            create function auth.uid()
            returns uuid language sql stable as $$
              select nullif(
                current_setting(
                  'request.jwt.claim.sub', true
                ),
                ''
              )::uuid
            $$;
            grant usage on schema auth, public
              to authenticated, anon;
            grant select on public.gymos_users
              to authenticated;
        """)
        execute(SQL_FILE.read_text(encoding="utf-8"))
        execute(
            "insert into auth.users values "
            f"('{A}'), ('{B}'), ('{TRAINER}');"
            "insert into public.gymos_users values "
            f"('{A}', 'user', 'active'),"
            f"('{B}', 'user', 'active'),"
            f"('{TRAINER}', 'trainer', 'active');"
        )
        yield execute
    finally:
        execute(
            f"drop database {database_name} with (force);",
            db="postgres",
        )


@pytest.fixture
def db(database):
    database("truncate public.goals cascade;")
    return database


def create_goal(
    db,
    *,
    user=A,
    kind="running",
    error=None,
):
    category = (
        "endurance"
        if kind == "running"
        else "health"
    )
    return db(
        "insert into public.goals ("
        "user_id, category, kind, created_by_user_id"
        ") values ("
        f"'{user}', '{category}', '{kind}', '{user}'"
        ") returning id;",
        role="authenticated",
        user=user,
        error=error,
    )


def test_one_active_goal_and_explicit_replacement(db):
    first = create_goal(db)
    create_goal(db, error="23505")

    db(
        "update public.goals set status='completed' "
        f"where id='{first}';",
        role="authenticated",
        user=A,
    )
    assert db(
        "select count(*) from public.goals "
        "where status='active';",
        role="authenticated",
        user=A,
    ) == "0"

    second = create_goal(db, kind="more_active")
    assert second != first
    assert db(
        "select count(*) from public.goals;",
        role="authenticated",
        user=A,
    ) == "2"


def test_completed_and_abandoned_leave_no_active_goal(db):
    for closing_status in (
        "completed",
        "abandoned",
    ):
        goal_id = create_goal(db)
        db(
            "update public.goals "
            f"set status='{closing_status}' "
            f"where id='{goal_id}';",
            role="authenticated",
            user=A,
        )
        assert db(
            "select count(*) from public.goals "
            "where status='active';",
            role="authenticated",
            user=A,
        ) == "0"


def test_rls_hides_and_protects_other_users_goals(db):
    goal_id = create_goal(db)
    assert db(
        "select count(*) from public.goals;",
        role="authenticated",
        user=B,
    ) == "0"
    db(
        "update public.goals set status='abandoned' "
        f"where id='{goal_id}';",
        role="authenticated",
        user=B,
    )
    assert db(
        "select status from public.goals "
        f"where id='{goal_id}';",
        role="authenticated",
        user=A,
    ) == "active"


def test_trainer_has_no_goal_access(db):
    create_goal(db)
    assert db(
        "select count(*) from public.goals;",
        role="authenticated",
        user=TRAINER,
    ) == "0"
    create_goal(
        db,
        user=TRAINER,
        error="42501",
    )


def test_database_rejects_invalid_taxonomy_and_updates_timestamp(db):
    db(
        "insert into public.goals ("
        "user_id, category, kind, created_by_user_id"
        f") values ('{A}', 'health', 'triathlon', '{A}');",
        error="23514",
    )
    db(
        "insert into public.goals ("
        "user_id, category, kind, variant, created_by_user_id"
        ") values ("
        f"'{A}', 'endurance', 'running', 'olympic', '{A}'"
        ");",
        error="23514",
    )

    goal_id = create_goal(db)
    timestamps = db(
        "update public.goals set target_date='2027-04-18' "
        f"where id='{goal_id}' returning "
        "(updated_at >= created_at)::text;",
        role="authenticated",
        user=A,
    )
    assert timestamps == "true"


def create_body_goal(db, *, user=A):
    return db(
        "insert into public.goals ("
        "user_id, category, kind, created_by_user_id"
        ") values ("
        f"'{user}', 'body_composition', 'fat_loss', '{user}'"
        ") returning id;",
        role="authenticated",
        user=user,
    )


def create_metric(
    db,
    goal_id,
    *,
    key="body_weight",
    target="null",
    user=A,
    error=None,
):
    return db(
        "insert into public.goal_metrics ("
        "goal_id, metric_key, target_value"
        ") values ("
        f"'{goal_id}', '{key}', {target}"
        ") returning id;",
        role="authenticated",
        user=user,
        error=error,
    )


def test_metric_fk_uniqueness_and_value_constraints(db):
    goal_id = create_body_goal(db)
    create_metric(db, goal_id, target="80")
    create_metric(db, goal_id, error="23505")
    create_metric(
        db,
        goal_id,
        key="waist_circumference",
        target="400",
        error="23514",
    )
    db(
        "insert into public.goal_metrics (goal_id, metric_key) "
        "values ("
        "'99999999-9999-4999-8999-999999999999',"
        "'body_weight');",
        error="23503",
    )


def test_target_and_baseline_are_independently_nullable(db):
    goal_id = create_body_goal(db)
    metric_id = create_metric(db, goal_id)
    assert db(
        "select target_value is null from public.goal_metrics "
        f"where id='{metric_id}';",
        role="authenticated",
        user=A,
    ) == "t"
    db(
        "update public.goal_metrics set target_value=84 "
        f"where id='{metric_id}';",
        role="authenticated",
        user=A,
    )
    baseline_id = db(
        "insert into public.goal_metric_baselines ("
        "goal_metric_id, value, measured_at, source_type"
        ") values ("
        f"'{metric_id}', 91, '2026-09-01', 'manual'"
        ") returning id;",
        role="authenticated",
        user=A,
    )
    corrected_id = db(
        "insert into public.goal_metric_baselines ("
        "goal_metric_id, value, measured_at, source_type"
        ") values ("
        f"'{metric_id}', 90, '2026-09-02', 'manual'"
        ") on conflict (goal_metric_id) do update set "
        "value=excluded.value, measured_at=excluded.measured_at "
        "returning id;",
        role="authenticated",
        user=A,
    )
    assert corrected_id == baseline_id
    assert db(
        "select value || '|' || measured_at::text "
        "from public.goal_metric_baselines "
        f"where id='{baseline_id}';",
        role="authenticated",
        user=A,
    ) == "90|2026-09-02"


def test_baseline_integrity_and_provenance(db):
    goal_id = create_body_goal(db)
    metric_id = create_metric(db, goal_id)
    db(
        "insert into public.goal_metric_baselines ("
        "goal_metric_id, value, measured_at, source_type,"
        "source_record_id) values ("
        f"'{metric_id}', 91, '2026-09-01', 'manual', 'row-1'"
        ");",
        role="authenticated",
        user=A,
        error="23514",
    )
    db(
        "insert into public.goal_metric_baselines ("
        "goal_metric_id, value, measured_at, source_type"
        ") values ("
        f"'{metric_id}', 500, '2026-09-01', 'manual'"
        ");",
        role="authenticated",
        user=A,
        error="23514",
    )


def test_metric_and_baseline_rls_enforce_goal_owner(db):
    goal_id = create_body_goal(db)
    metric_id = create_metric(db, goal_id, target="80")
    db(
        "insert into public.goal_metric_baselines ("
        "goal_metric_id, value, measured_at, source_type"
        ") values ("
        f"'{metric_id}', 91, '2026-09-01', 'manual'"
        ");",
        role="authenticated",
        user=A,
    )
    assert db(
        "select count(*) from public.goal_metrics;",
        role="authenticated",
        user=B,
    ) == "0"
    assert db(
        "select count(*) from public.goal_metric_baselines;",
        role="authenticated",
        user=B,
    ) == "0"
    db(
        "update public.goal_metrics set target_value=70 "
        f"where id='{metric_id}';",
        role="authenticated",
        user=B,
    )
    assert db(
        "select target_value from public.goal_metrics "
        f"where id='{metric_id}';",
        role="authenticated",
        user=A,
    ) == "80"
    create_metric(
        db,
        goal_id,
        key="waist_circumference",
        user=TRAINER,
        error="42501",
    )
