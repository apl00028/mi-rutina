from pathlib import Path


def test_swimming_sessions_sql_has_storage_and_rls():
    sql = (
        Path(__file__).resolve().parents[2]
        / "database"
        / "supabase"
        / "swimming-sessions.sql"
    ).read_text(encoding="utf-8")

    assert "public.swimming_sessions" in sql
    assert "user_id uuid not null" in sql
    assert "source_file_hash text" in sql
    assert "started_at timestamptz not null" in sql
    assert "data jsonb not null" in sql

    assert (
        "swimming_sessions_user_source_hash_uidx"
        in sql
    )

    assert (
        "alter table public.swimming_sessions"
        in sql
    )
    assert "enable row level security" in sql

    assert (
        "(select auth.uid()) = user_id"
        in sql
    )
