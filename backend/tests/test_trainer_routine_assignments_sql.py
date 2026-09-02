import re
from pathlib import Path


def _sql() -> str:
    return (
        Path(__file__).resolve().parents[2]
        / "database"
        / "supabase"
        / "trainer-routine-assignments.sql"
    ).read_text(encoding="utf-8").lower()


def test_trainer_routine_assignments_sql_creates_table_constraints_and_indexes():
    sql = _sql()

    assert "create table if not exists public.trainer_routine_assignments" in sql
    assert "id uuid primary key" in sql
    assert "default gen_random_uuid()" in sql
    assert "trainer_id uuid not null" in sql
    assert "athlete_id uuid not null" in sql
    assert "template_id text not null" in sql
    assert "routine_id text not null" in sql
    assert "discipline text not null" in sql
    assert "assigned_at timestamptz not null" in sql
    assert "references auth.users(id)" in sql
    assert "foreign key (trainer_id, template_id)" in sql
    assert "references public.trainer_routine_templates(trainer_id, id)" in sql
    assert "on delete restrict" in sql
    assert "foreign key (athlete_id, routine_id, discipline)" in sql
    assert "references public.routines(user_id, id, discipline)" in sql
    assert "unique (athlete_id, routine_id)" in sql
    assert "'strength'" in sql
    assert "'swimming'" in sql
    assert "'cycling'" in sql
    assert "'running'" in sql
    assert "trainer_routine_assignments_trainer_assigned_at_idx" in sql
    assert "trainer_routine_assignments_athlete_assigned_at_idx" in sql
    assert "trainer_routine_assignments_trainer_athlete_idx" in sql


def test_assignment_rls_is_read_only_for_trainer_and_athlete():
    sql = _sql()

    assert (
        "alter table public.trainer_routine_assignments\n"
        "  enable row level security"
    ) in sql
    assert "(select auth.uid()) = trainer_id" in sql
    assert "(select auth.uid()) = athlete_id" in sql
    assert "from public.gymos_users" in sql
    assert "gymos_users.role = 'trainer'" in sql
    assert "gymos_users.status = 'active'" in sql

    created_policy_statements = re.findall(
        r"create policy.*?;",
        sql,
        flags=re.S,
    )

    assert len(created_policy_statements) == 2
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


def test_assignment_rpc_is_security_definer_and_narrowly_granted():
    sql = _sql()
    function_signature = re.search(
        (
            r"create or replace function "
            r"public\.trainer_assign_routine_template"
            r"\((.*?)\)\s+returns table"
        ),
        sql,
        flags=re.S,
    )

    assert "create or replace function public.trainer_assign_routine_template" in sql
    assert function_signature is not None
    signature_sql = function_signature.group(1)
    assert "p_athlete_id uuid" in signature_sql
    assert "p_template_id text" in signature_sql
    assert "p_routine_id text" in signature_sql
    assert "p_discipline" not in sql
    assert "p_routine_data" not in sql
    assert "p_assigned_at" not in sql
    assert "security definer" in sql
    assert "set search_path = ''" in sql
    assert "revoke all" in sql
    assert "from public, anon" in sql
    assert "grant execute" in sql
    assert "to authenticated" in sql
    assert "execute" not in re.search(
        r"revoke all.*?;",
        sql,
        flags=re.S,
    ).group(0)


def test_assignment_rpc_verifies_authorization_and_inserts_atomically():
    sql = _sql()

    assert "current_trainer_id uuid := auth.uid()" in sql
    assert "from auth.users" in sql
    assert "where users.id = current_trainer_id" in sql
    assert "effective_assigned_at timestamptz := pg_catalog.now()" in sql
    assert "where gymos_users.user_id = current_trainer_id" in sql
    assert "gymos_users.role = 'trainer'" in sql
    assert "gymos_users.status = 'active'" in sql
    assert "from public.trainer_athletes" in sql
    assert "trainer_athletes.trainer_id = current_trainer_id" in sql
    assert "trainer_athletes.athlete_id = p_athlete_id" in sql
    assert "trainer_athletes.status = 'active'" in sql
    assert "from public.trainer_routine_templates" in sql
    assert "trainer_routine_templates.trainer_id = current_trainer_id" in sql
    assert "trainer_routine_templates.id = p_template_id" in sql
    assert "trainer_routine_templates.discipline" in sql
    assert "trainer_routine_templates.data" in sql
    assert "into\n    template_discipline,\n    template_data" in sql
    assert "generated_routine_data := template_data" in sql
    assert "pg_catalog.jsonb_set" in sql
    assert "'{routineid}'" in sql
    assert "pg_catalog.to_jsonb(p_routine_id)" in sql
    assert "'{discipline}'" in sql
    assert "pg_catalog.to_jsonb(template_discipline)" in sql
    assert "'{source}'" in sql
    assert "pg_catalog.jsonb_build_object" in sql
    assert "'trainerid'" in sql
    assert "current_trainer_id" in sql
    assert "'templateid'" in sql
    assert "p_template_id" in sql
    assert "'assignedat'" in sql
    assert "effective_assigned_at" in sql
    assert "insert into public.routines" in sql
    assert "p_athlete_id" in sql
    assert "generated_routine_data" in sql
    assert "insert into public.trainer_routine_assignments" in sql
    assert "current_trainer_id" in sql
    assert "dynamic sql" not in sql
    assert "execute " not in sql.replace("grant execute", "")


def test_assignment_rpc_grants_exact_three_argument_signature():
    sql = _sql()

    assert (
        "on function public.trainer_assign_routine_template(\n"
        "  uuid,\n"
        "  text,\n"
        "  text\n"
        ")"
    ) in sql
    assert (
        "drop function if exists public.trainer_assign_routine_template(\n"
        "  uuid,\n"
        "  text,\n"
        "  text,\n"
        "  text,\n"
        "  jsonb,\n"
        "  timestamptz\n"
        ")"
    ) in sql
