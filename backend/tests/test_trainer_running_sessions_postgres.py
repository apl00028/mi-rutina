"""Real PostgreSQL tests for trainer running-session aggregation.

Opt in with APTUS_TEST_POSTGRES_CONTAINER. The target must be a disposable
local PostgreSQL container. No remote Supabase connection is accepted.
"""

import json
import os
from pathlib import Path
import subprocess
from uuid import uuid4

import pytest


SQL_DIR = Path(__file__).resolve().parents[2] / "database" / "supabase"

TRAINER = "00000000-0000-0000-0000-000000000001"
ATHLETE = "00000000-0000-0000-0000-000000000002"
OTHER_TRAINER = "00000000-0000-0000-0000-000000000003"
OTHER_ATHLETE = "00000000-0000-0000-0000-000000000004"
INACTIVE_TRAINER = "00000000-0000-0000-0000-000000000005"


def literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


@pytest.fixture(scope="module")
def database():
    container = os.environ.get("APTUS_TEST_POSTGRES_CONTAINER")
    if not container:
        pytest.skip("Set APTUS_TEST_POSTGRES_CONTAINER")

    database_name = "aptus_trainer_running_" + uuid4().hex

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
            assert role in ("authenticated", "anon", "service_role")
            prefix += f"set role {role};\n"

        if user:
            prefix += (
                "set request.jwt.claim.sub = "
                + literal(user)
                + ";\n"
            )

        result = subprocess.run(
            [
                "docker", "exec", "-i", container,
                "psql", "-X", "-qAt",
                "-v", "ON_ERROR_STOP=1",
                "-v", "VERBOSITY=verbose",
                "-U", "postgres",
                "-d", db,
            ],
            input=prefix + sql,
            text=True,
            capture_output=True,
            timeout=30,
        )

        if error:
            assert result.returncode != 0, result.stdout
            assert error in result.stderr, result.stderr
        else:
            assert result.returncode == 0, result.stderr

        return result.stdout.strip()

    execute(
        f"create database {database_name};",
        db="postgres",
    )

    try:
        execute(
            """
            do $$
            begin
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

              if not exists (
                select from pg_roles
                where rolname = 'service_role'
              ) then
                create role service_role nologin;
              end if;
            end
            $$;

            create schema auth;

            create table auth.users (
              id uuid primary key
            );

            create function auth.uid()
            returns uuid
            language sql
            stable
            as $$
              select nullif(
                current_setting(
                  'request.jwt.claim.sub',
                  true
                ),
                ''
              )::uuid
            $$;

            grant usage on schema auth, public
            to authenticated, anon, service_role;

            create table public.gymos_users (
              user_id uuid primary key
                references auth.users(id)
                on delete cascade,
              role text not null,
              status text not null
            );
            """
        )

        for filename in [
            "routines.sql",
            "workouts.sql",
            "running-sessions.sql",
            "trainer-athletes.sql",
            "trainer-athlete-running-sessions.sql",
        ]:
            execute(
                (SQL_DIR / filename).read_text(
                    encoding="utf-8"
                )
            )

        yield execute

    finally:
        execute(
            f"drop database {database_name} with (force);",
            db="postgres",
        )


@pytest.fixture
def db(database):
    database("truncate auth.users cascade;")

    database(
        f"""
        insert into auth.users(id) values
          ('{TRAINER}'),
          ('{ATHLETE}'),
          ('{OTHER_TRAINER}'),
          ('{OTHER_ATHLETE}'),
          ('{INACTIVE_TRAINER}');

        insert into public.gymos_users(
          user_id, role, status
        ) values
          ('{TRAINER}', 'trainer', 'active'),
          ('{ATHLETE}', 'user', 'active'),
          ('{OTHER_TRAINER}', 'trainer', 'active'),
          ('{OTHER_ATHLETE}', 'user', 'active'),
          ('{INACTIVE_TRAINER}', 'trainer', 'inactive');

        insert into public.trainer_athletes(
          trainer_id, athlete_id, status
        ) values
          ('{TRAINER}', '{ATHLETE}', 'active'),
          ('{INACTIVE_TRAINER}', '{ATHLETE}', 'active');
        """
    )

    return database


def trainer_rows(
    db,
    user: str,
    *,
    athlete: str = ATHLETE,
    role: str = "authenticated",
    error: str | None = None,
):
    output = db(
        f"""
        select row_to_json(session_row)
        from public.trainer_list_athlete_running_sessions(
          '{athlete}'::uuid
        ) as session_row;
        """,
        role=role,
        user=user,
        error=error,
    )

    if error:
        return []

    return [
        json.loads(line)
        for line in output.splitlines()
        if line.strip()
    ]


def add_external(
    db,
    *,
    row_id: str,
    started_at: str,
    ended_at: str,
    exercise_type: int = 33,
    athlete: str = ATHLETE,
):
    data = json.dumps(
        {
            "schema_version": 1,
            "exercise_type": exercise_type,
        }
    )

    db(
        f"""
        insert into public.running_sessions(
          user_id,
          id,
          source,
          source_package,
          source_record_id,
          started_at,
          ended_at,
          data
        )
        values (
          '{athlete}',
          {literal(row_id)},
          'health_connect',
          'com.garmin.android.apps.connectmobile',
          {literal("record-" + row_id)},
          {literal(started_at)}::timestamptz,
          {literal(ended_at)}::timestamptz,
          {literal(data)}::jsonb
        );
        """
    )


def add_aptus_workout(
    db,
    *,
    workout_id: str,
    started_at: str,
    finished_at: str,
    title: str = "Series Aptus",
):
    routine_id = "routine-" + workout_id
    session_id = "session-" + workout_id

    routine_data = json.dumps(
        {
            "discipline": "running",
            "sessions": [
                {
                    "sessionId": session_id,
                    "name": title,
                }
            ],
        }
    )

    workout_data = json.dumps(
        {
            "workoutId": workout_id,
            "routineId": routine_id,
            "sessionId": session_id,
            "status": "finished",
            "startedAt": started_at,
            "finishedAt": finished_at,
        }
    )

    db(
        f"""
        insert into public.routines(
          id, user_id, data
        )
        values (
          {literal(routine_id)},
          '{ATHLETE}',
          {literal(routine_data)}::jsonb
        );

        insert into public.workouts(
          id, user_id, data
        )
        values (
          {literal("row-" + workout_id)},
          '{ATHLETE}',
          {literal(workout_data)}::jsonb
        );
        """
    )


def test_related_trainer_reads_external_contract(db):
    add_external(
        db,
        row_id="external-1",
        started_at="2026-08-30T08:00:00Z",
        ended_at="2026-08-30T08:25:00Z",
    )

    rows = trainer_rows(db, TRAINER)

    assert len(rows) == 1
    row = rows[0]

    assert row["id"] == "health-connect:external-1"
    assert row["discipline"] == "running"
    assert row["title"] == "Carrera exterior"
    assert row["event_at"] == row["started_at"]
    assert row["finished_at"] == "2026-08-30 08:25:00+00"
    assert row["routine_id"] is None
    assert row["session_id"] is None
    assert row["duration_seconds"] == 1500
    assert row["source"] == "health_connect"


def test_treadmill_title(db):
    add_external(
        db,
        row_id="treadmill",
        started_at="2026-08-30T09:00:00Z",
        ended_at="2026-08-30T09:30:00Z",
        exercise_type=34,
    )

    rows = trainer_rows(db, TRAINER)

    assert rows[0]["title"] == "Carrera en cinta"


def test_security_boundary(db):
    add_external(
        db,
        row_id="private-run",
        started_at="2026-08-30T08:00:00Z",
        ended_at="2026-08-30T08:20:00Z",
    )

    assert len(trainer_rows(db, TRAINER)) == 1
    assert trainer_rows(db, OTHER_TRAINER) == []
    assert trainer_rows(db, ATHLETE) == []
    assert trainer_rows(db, INACTIVE_TRAINER) == []

    # RLS still prevents the trainer reading the athlete's rows directly.
    direct_count = db(
        "select count(*) from public.running_sessions;",
        role="authenticated",
        user=TRAINER,
    )
    assert direct_count == "0"


def test_existing_aptus_workout_is_preserved(db):
    add_aptus_workout(
        db,
        workout_id="aptus-1",
        started_at="2026-08-30T10:00:00Z",
        finished_at="2026-08-30T10:40:00Z",
        title="Rodaje progresivo",
    )

    rows = trainer_rows(db, TRAINER)

    assert len(rows) == 1
    row = rows[0]

    assert row["id"] == "aptus-workout:aptus-1"
    assert row["title"] == "Rodaje progresivo"
    assert row["routine_id"] == "routine-aptus-1"
    assert row["session_id"] == "session-aptus-1"
    assert row["started_at"] == "2026-08-30T10:00:00Z"
    assert row["finished_at"] == "2026-08-30T10:40:00Z"

    # Deliberately preserve the old Aptus calendar semantics in this step.
    assert row["event_at"] == row["finished_at"]
    assert row["duration_seconds"] is None
    assert row["source"] == "aptus_workout"


def test_union_all_same_timestamp_and_cross_source_ids(db):
    add_external(
        db,
        row_id="collision",
        started_at="2026-08-30T10:00:00Z",
        ended_at="2026-08-30T10:30:00Z",
    )

    add_aptus_workout(
        db,
        workout_id="health-connect:collision",
        started_at="2026-08-30T09:30:00Z",
        finished_at="2026-08-30T10:00:00Z",
    )

    add_external(
        db,
        row_id="newest",
        started_at="2026-08-30T12:00:00Z",
        ended_at="2026-08-30T12:20:00Z",
    )

    rows = trainer_rows(db, TRAINER)

    assert len(rows) == 3
    assert rows[0]["id"] == "health-connect:newest"

    tie_rows = rows[1:]
    assert {
        row["source"]
        for row in tie_rows
    } == {
        "aptus_workout",
        "health_connect",
    }

    ids = [row["id"] for row in rows]
    assert len(ids) == len(set(ids))
    assert (
        "aptus-workout:health-connect:collision"
        in ids
    )
    assert "health-connect:collision" in ids


def test_global_order_and_limit_are_after_union(db):
    # One shared running routine for 13 Aptus workouts.
    routine_data = json.dumps(
        {
            "discipline": "running",
            "sessions": [],
        }
    )

    db(
        f"""
        insert into public.routines(id, user_id, data)
        values (
          'limit-routine',
          '{ATHLETE}',
          {literal(routine_data)}::jsonb
        );

        insert into public.running_sessions(
          user_id,
          id,
          source,
          source_package,
          source_record_id,
          started_at,
          ended_at,
          data
        )
        select
          '{ATHLETE}'::uuid,
          'ext-' || g,
          'health_connect',
          'writer',
          'ext-record-' || g,
          timestamptz '2026-08-01 00:00:00+00'
            + g * interval '2 hours',
          timestamptz '2026-08-01 00:30:00+00'
            + g * interval '2 hours',
          '{{"schema_version":1,"exercise_type":33}}'::jsonb
        from generate_series(1, 13) as g;

        insert into public.workouts(
          id,
          user_id,
          data
        )
        select
          'aptus-row-' || g,
          '{ATHLETE}'::uuid,
          jsonb_build_object(
            'workoutId', 'aptus-limit-' || g,
            'routineId', 'limit-routine',
            'sessionId', 's-' || g,
            'sessionName', 'Aptus ' || g,
            'status', 'finished',
            'startedAt',
              timestamptz '2026-08-01 01:00:00+00'
                + g * interval '2 hours',
            'finishedAt',
              timestamptz '2026-08-01 01:30:00+00'
                + g * interval '2 hours'
          )
        from generate_series(1, 13) as g;
        """
    )

    rows = trainer_rows(db, TRAINER)

    assert len(rows) == 25
    assert {
        row["source"]
        for row in rows
    } == {
        "aptus_workout",
        "health_connect",
    }

    event_times = [
        row["event_at"]
        for row in rows
    ]

    # PostgreSQL ordering must already be newest first.
    parsed = [
        item.replace(" ", "T")
        for item in event_times
    ]
    assert parsed == sorted(parsed, reverse=True)


def test_rpc_execute_privileges(db):
    privileges = db(
        """
        select
          has_function_privilege(
            'authenticated',
            'public.trainer_list_athlete_running_sessions(uuid)',
            'EXECUTE'
          ),
          has_function_privilege(
            'anon',
            'public.trainer_list_athlete_running_sessions(uuid)',
            'EXECUTE'
          );
        """
    )

    assert privileges == "t|f"

    trainer_rows(
        db,
        OTHER_TRAINER,
        role="anon",
        error="42501",
    )
