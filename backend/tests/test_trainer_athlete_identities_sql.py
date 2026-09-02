from pathlib import Path
import re


def _sql() -> str:
    return (
        Path(__file__).resolve().parents[2]
        / "database"
        / "supabase"
        / "trainer-athlete-identities.sql"
    ).read_text(encoding="utf-8").lower()


def test_identity_rpc_returns_only_minimal_columns():
    sql = _sql()

    assert (
        "returns table (\n"
        "  athlete_id uuid,\n"
        "  status text,\n"
        "  email text,\n"
        "  display_name text,\n"
        "  client_since timestamptz\n"
        ")"
    ) in sql
    assert "alias" not in sql
    assert "plan" not in sql
    assert "metadata" not in sql
    assert "created_at timestamptz" not in sql
    assert "updated_at timestamptz" not in sql


def test_identity_rpc_accepts_no_trainer_id_parameter():
    sql = _sql()
    signature = re.search(
        (
            r"create or replace function "
            r"public\.trainer_list_athlete_identities"
            r"\((.*?)\)\s+returns table"
        ),
        sql,
        flags=re.S,
    )

    assert signature is not None
    assert signature.group(1).strip() == ""
    assert "p_trainer_id" not in sql


def test_identity_rpc_is_security_definer_with_empty_search_path():
    sql = _sql()

    assert "security definer" in sql
    assert "set search_path = ''" in sql
    assert "dynamic sql" not in sql
    assert "execute " not in sql.replace(
        "grant execute",
        "",
    )


def test_identity_rpc_limits_to_active_authenticated_trainer():
    sql = _sql()

    assert "current_trainer.user_id = (select auth.uid())" in sql
    assert "current_trainer.role = 'trainer'" in sql
    assert "current_trainer.status = 'active'" in sql
    assert "trainer_athletes.trainer_id = (select auth.uid())" in sql
    assert "trainer_athletes.status = 'active'" in sql


def test_identity_rpc_reads_real_identity_sources():
    sql = _sql()

    assert "from public.trainer_athletes" in sql
    assert (
        "trainer_athletes.created_at as client_since"
        in sql
    )
    assert "left join public.gymos_users as athlete_users" in sql
    assert "athlete_users.user_id = trainer_athletes.athlete_id" in sql
    assert "athlete_users.email" in sql
    assert "left join public.profiles" in sql
    assert "profiles.id = trainer_athletes.athlete_id" in sql
    assert "profiles.display_name" in sql


def test_identity_rpc_privileges_are_narrow():
    sql = _sql()

    assert (
        "revoke all\n"
        "on function public.trainer_list_athlete_identities()\n"
        "from public, anon"
    ) in sql
    assert (
        "grant execute\n"
        "on function public.trainer_list_athlete_identities()\n"
        "to authenticated"
    ) in sql
