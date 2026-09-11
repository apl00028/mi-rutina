"""Real PostgreSQL checks for self-service athlete signup."""

import os
from pathlib import Path
import subprocess
from uuid import uuid4

import pytest


SQL_FILE = (
    Path(__file__).resolve().parents[2]
    / "database"
    / "supabase"
    / "self-service-athlete-signup.sql"
)
A = "00000000-0000-4000-8000-000000000001"
B = "00000000-0000-4000-8000-000000000002"


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

    database_name = "aptus_signup_test_" + uuid4().hex

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
        execute(f"""
            do $$ begin
              if not exists (
                select from pg_roles where rolname = 'authenticated'
              ) then
                create role authenticated nologin;
              end if;
            end $$;
            create schema auth;
            create table auth.users (id uuid primary key);
            create table public.gymos_users (
              user_id uuid primary key references auth.users(id),
              email text not null,
              role text not null,
              status text not null,
              plan text not null,
              expires_at timestamptz,
              constraint gymos_users_plan_check
                check (plan in ('trial', 'basic', 'pro'))
            );
            create function auth.uid()
            returns uuid language sql stable as $$
              select nullif(
                current_setting('request.jwt.claim.sub', true), ''
              )::uuid
            $$;
            alter table public.gymos_users enable row level security;
            grant usage on schema auth, public to authenticated;
            grant select, insert on public.gymos_users to authenticated;
            create policy gymos_users_select_own
              on public.gymos_users for select to authenticated
              using (user_id = (select auth.uid()));
            create policy gymos_users_insert_own_pending
              on public.gymos_users for insert to authenticated
              with check (
                user_id = (select auth.uid())
                and role = 'user'
                and status = 'pending'
                and plan = 'trial'
              );
            insert into auth.users values ('{A}'), ('{B}');
        """)
        execute(SQL_FILE.read_text(encoding="utf-8"))
        yield execute
    finally:
        execute(
            f"drop database {database_name} with (force);",
            db="postgres",
        )


def test_signup_rls_plan_and_conflict_preservation(database):
    db = database

    db(
        "insert into public.gymos_users "
        "(user_id, email, role, status, plan) values "
        f"('{A}', 'a@example.com', 'user', 'active', 'free');",
        role="authenticated",
        user=A,
    )
    assert db(
        "select role || ':' || status || ':' || plan "
        "from public.gymos_users;",
        role="authenticated",
        user=A,
    ) == "user:active:free"

    db(
        "insert into public.gymos_users "
        "(user_id, email, role, status, plan) values "
        f"('{B}', 'b@example.com', 'user', 'pending', 'trial');",
        role="authenticated",
        user=B,
        error="42501",
    )
    db(
        "insert into public.gymos_users "
        "(user_id, email, role, status, plan) values "
        f"('{B}', 'b@example.com', 'user', 'active', 'free');",
        role="authenticated",
        user=A,
        error="42501",
    )

    db(
        "insert into public.gymos_users "
        "(user_id, email, role, status, plan) values "
        f"('{B}', 'admin@example.com', 'admin', 'active', 'pro');"
    )
    db(
        "insert into public.gymos_users "
        "(user_id, email, role, status, plan) values "
        f"('{B}', 'new@example.com', 'user', 'active', 'free') "
        "on conflict (user_id) do nothing;",
        role="authenticated",
        user=B,
    )
    assert db(
        "select role || ':' || status || ':' || plan "
        f"from public.gymos_users where user_id = '{B}';"
    ) == "admin:active:pro"
