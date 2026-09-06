"""Real PostgreSQL tests; opt in with APTUS_TEST_POSTGRES_CONTAINER.

The container must be a disposable local postgres:16 with local trust auth.
No DSN or remote Supabase connection is accepted. Each run creates/drops its
own database; auth.uid() and unrelated account-deletion tables are test stubs.
"""

from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import re
import subprocess
from threading import Barrier
from uuid import uuid4

import pytest


SQL_DIR = Path(__file__).resolve().parents[2] / "database" / "supabase"
A = "00000000-0000-0000-0000-000000000001"
B = "00000000-0000-0000-0000-000000000002"


def literal(value):
    return "'" + value.replace("'", "''") + "'"


@pytest.fixture(scope="module")
def database():
    container = os.environ.get("APTUS_TEST_POSTGRES_CONTAINER")
    if not container:
        pytest.skip("Set APTUS_TEST_POSTGRES_CONTAINER for local PostgreSQL tests")
    database_name = "aptus_running_test_" + uuid4().hex

    def execute(sql, *, db=database_name, role=None, user=None, error=None):
        prefix = ""
        if role:
            assert role in ("authenticated", "anon", "service_role")
            prefix += f"set role {role};\n"
        if user:
            prefix += f"set request.jwt.claim.sub = {literal(user)};\n"
        result = subprocess.run(
            ["docker", "exec", "-i", container, "psql", "-X", "-qAt",
             "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose",
             "-U", "postgres", "-d", db],
            input=prefix + sql, text=True, capture_output=True, timeout=30,
        )
        if error:
            assert result.returncode != 0, result.stdout
            assert error in result.stderr, result.stderr
        else:
            assert result.returncode == 0, result.stderr
        return result.stdout.strip()

    execute(f"create database {database_name};", db="postgres")
    try:
        execute("""
            do $$ begin
              if not exists (select from pg_roles where rolname = 'authenticated') then
                create role authenticated nologin;
                create role anon nologin;
                create role service_role nologin;
              end if;
            end $$;
            create schema auth;
            create table auth.users (id uuid primary key);
            create function auth.uid() returns uuid language sql stable as $$
              select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
            $$;
            grant usage on schema auth, public to authenticated, anon, service_role;
            -- Exercise the production revokes even for a pre-existing schema
            -- with direct and inherited PUBLIC grants.
            create schema aptus_private;
            grant usage, create on schema aptus_private to public, anon, authenticated;
        """)
        execute((SQL_DIR / "running-sessions.sql").read_text())
        deletion_sql = (SQL_DIR / "delete-account.sql").read_text()
        # Only unrelated tables are stubs; running_sessions and both production
        # RPC implementations are installed from the actual SQL files.
        for table in re.findall(r"delete from public\.(\w+)", deletion_sql):
            if table != "running_sessions":
                execute(f"create table public.{table} (user_id uuid);")
        execute(deletion_sql)
        yield execute
    finally:
        execute(f"drop database {database_name} with (force);", db="postgres")


@pytest.fixture
def db(database):
    database("truncate public.running_sessions; delete from auth.users;")
    database(f"insert into auth.users values ('{A}'), ('{B}');")
    return database


def session(**overrides):
    return {
        "source_package": "com.garmin.android.apps.connectmobile",
        "source_record_id": "hc-record-30-08",
        "started_at": "2026-08-30T08:00:00Z",
        "ended_at": "2026-08-30T08:25:00Z",
        "data": {"schema_version": 1, "exercise_type": 33,
                 "distance_meters": 5000, "heart_rate_average_bpm": None},
        **overrides,
    }


def upsert_sql(payload):
    return (
        "select row_to_json(s) from public.upsert_my_running_session("
        + literal(json.dumps(payload)) + "::jsonb) s;"
    )


def save(db, payload=None, user=A):
    return json.loads(db(upsert_sql(payload or session()), role="authenticated", user=user))


def test_retry_and_updated_metrics_keep_row_id_and_creation_time(db):
    first = save(db)
    assert save(db)["id"] == first["id"]
    updated = save(db, session(
        started_at="2026-08-30T08:01:00Z", ended_at="2026-08-30T08:27:00Z",
        data={"schema_version": 1, "exercise_type": 34, "distance_meters": 5100},
    ))
    assert updated["id"] == first["id"]
    assert updated["created_at"] == first["created_at"]
    assert updated["updated_at"] > first["updated_at"]
    assert updated["started_at"] != first["started_at"]
    assert updated["ended_at"] != first["ended_at"]
    assert updated["data"]["distance_meters"] == 5100
    assert updated["data"]["heart_rate_average_bpm"] is None
    assert db("select count(*) from public.running_sessions;") == "1"


def test_concurrent_retries_are_one_row(db):
    barrier = Barrier(6)

    def worker(_):
        barrier.wait(timeout=10)
        return save(db)["id"]

    with ThreadPoolExecutor(max_workers=6) as pool:
        ids = list(pool.map(worker, range(6)))
    assert len(set(ids)) == 1
    assert db("select count(*) from public.running_sessions;") == "1"


def test_identity_includes_record_writer_and_owner(db):
    rows = [save(db), save(db, session(source_record_id="other-record")),
            save(db, session(source_package="another.writer")), save(db, user=B)]
    assert len({row["id"] for row in rows}) == 4
    assert db("select count(*) from public.running_sessions;") == "4"


def test_null_is_not_zero_and_omitted_metrics_are_preserved(db):
    save(db)
    updated = save(db, session(data={"schema_version": 1, "exercise_type": 33}))
    assert updated["data"]["distance_meters"] == 5000
    assert "speed_average_meters_per_second" not in updated["data"]
    cleared = save(db, session(data={
        "schema_version": 1, "exercise_type": 33, "distance_meters": None,
    }))
    assert cleared["data"]["distance_meters"] is None


def test_rls_reads_only_owner_and_rpc_cannot_select_another_owner(db):
    a = save(db)
    b = save(db, user=B)
    for user, own, other in [(A, a, b), (B, b, a)]:
        assert db("select id from public.running_sessions;", role="authenticated", user=user) == own["id"]
        assert db(f"select id from public.running_sessions where id = '{other['id']}';",
                  role="authenticated", user=user) == ""
    save(db, session(data={"schema_version": 1, "exercise_type": 33, "distance_meters": 42}))
    assert db("select data->>'distance_meters' from public.running_sessions;",
              role="authenticated", user=B) == "5000"


@pytest.mark.parametrize("statement", [
    "insert into public.running_sessions(user_id) values ('" + B + "');",
    "update public.running_sessions set data = '{}'::jsonb;",
    "delete from public.running_sessions;",
])
def test_direct_writes_denied(db, statement):
    save(db, user=B)
    db(statement, role="authenticated", user=A, error="42501")


def test_anon_and_missing_identity_denied(db):
    db("select * from public.running_sessions;", role="anon", error="42501")
    db(upsert_sql(session()), role="anon", error="42501")
    db(upsert_sql(session()), role="authenticated", error="28000")
    db(upsert_sql(session()).replace("public.upsert", "aptus_private.upsert"),
       role="authenticated", error="42501")


@pytest.mark.parametrize("role", ["authenticated", "anon"])
def test_private_schema_and_function_have_no_effective_client_privileges(db, role):
    assert db("""
        select has_schema_privilege(current_user, 'aptus_private', 'USAGE'),
               has_schema_privilege(current_user, 'aptus_private', 'CREATE');
    """, role=role, user=A) == "f|f"
    # Resolve via the catalog OID so this tests EXECUTE independently of the
    # lack of schema USAGE (name-based regprocedure resolution would fail).
    assert db("""
        select has_function_privilege(current_user, p.oid, 'EXECUTE')
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'aptus_private'
          and p.proname = 'upsert_my_running_session';
    """, role=role, user=A) == "f"
    db(upsert_sql(session()).replace("public.upsert", "aptus_private.upsert"),
       role=role, user=A, error="42501")


def test_public_definer_delegates_without_private_schema_access(db):
    assert db("""
        select has_function_privilege(
          current_user, 'public.upsert_my_running_session(jsonb)', 'EXECUTE'
        );
    """, role="authenticated", user=A) == "t"
    assert db("""
        select p.prosecdef, p.proconfig = array['search_path=""']
        from pg_catalog.pg_proc p
        where p.oid = 'public.upsert_my_running_session(jsonb)'::regprocedure;
    """) == "t|t"
    assert save(db)["user_id"] == A
    assert save(db, user=B)["user_id"] == B


@pytest.mark.parametrize("payload", [
    None, [], {}, session(user_id=B), session(id="chosen"), session(source="garmin_api"),
    session(source_record_id=" \t\n"), session(source_package=123),
    session(started_at="2026-08-30T08:00:00"), session(started_at="infinity"),
    session(data=[]), session(data=None), session(data={}),
    session(data={"schema_version": 2, "exercise_type": 33}),
    session(data={"schema_version": 1, "exercise_type": 53}),
    *[session(data={"schema_version": 1, "exercise_type": 33, **bad}) for bad in [
        {"distance_meters": -1}, {"distance_meters": "NaN"},
        {"distance_meters": True}, {"lap_count": 1.5}, {"has_route": 1},
        {"user_id": B}, {"duration_seconds": 1500},
    ]],
])
def test_invalid_payload_rejected_without_write(db, payload):
    db(upsert_sql(payload), role="authenticated", user=A, error="22023")
    assert db("select count(*) from public.running_sessions;") == "0"


def test_reversed_times_rejected_and_existing_row_unchanged(db):
    first = save(db)
    db(upsert_sql(session(ended_at="2026-08-30T07:00:00Z")),
       role="authenticated", user=A, error="23514")
    assert db("select ended_at::text from public.running_sessions;") == "2026-08-30 08:25:00+00"
    assert db("select id from public.running_sessions;") == first["id"]


def test_offsets_represent_same_instant_without_global_timezone(db):
    first = save(db)
    updated = save(db, session(started_at="2026-08-30T10:00:00+02:00",
                               ended_at="2026-08-30T10:25:00+02:00"))
    assert first["started_at"] == updated["started_at"]
    assert first["ended_at"] == updated["ended_at"]


@pytest.mark.parametrize("changes,code", [
    ({"id": " \t\n"}, "23514"),
    ({"source": "garmin_api"}, "23514"),
    ({"source_package": ""}, "23514"),
    ({"source_record_id": ""}, "23514"),
    ({"data": []}, "23514"),
    ({"ended_at": "2026-08-29T08:00:00Z"}, "23514"),
    ({"started_at": "-infinity"}, "23514"),
    ({"user_id": None}, "23502"),
    ({"source_record_id": None}, "23502"),
])
def test_table_constraints_also_protect_privileged_writes(db, changes, code):
    row = {
        **session(), "user_id": A, "id": "internal-id", "source": "health_connect",
        "created_at": "2026-09-06T08:00:00Z", "updated_at": "2026-09-06T08:00:00Z",
        **changes,
    }
    db("insert into public.running_sessions select * from jsonb_populate_record("
       "null::public.running_sessions, " + literal(json.dumps(row)) + "::jsonb);",
       error=code)


def test_explicit_account_cleanup_and_auth_cascade(db):
    save(db)
    b = save(db, user=B)
    db(f"select public.delete_aptus_user_data('{A}');", role="authenticated", user=A, error="42501")
    db(f"select public.delete_aptus_user_data('{A}');", role="service_role")
    assert db("select id from public.running_sessions;") == b["id"]
    assert db(f"select count(*) from auth.users where id = '{A}';") == "1"
    db(f"delete from auth.users where id = '{B}';")
    assert db("select count(*) from public.running_sessions;") == "0"
