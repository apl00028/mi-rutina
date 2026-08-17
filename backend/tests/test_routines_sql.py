from pathlib import Path


def test_routines_sql_includes_rls_policy():
    sql = (
        Path(__file__).resolve().parents[2]
        / "database"
        / "supabase"
        / "routines.sql"
    ).read_text(encoding="utf-8")

    assert "create table if not exists public.routines" in sql
    assert "primary key (user_id, id)" in sql
    assert "data jsonb not null" in sql
    assert "alter table public.routines enable row level security" in sql
    assert "for select" in sql
    assert "using ((select auth.uid()) = user_id)" in sql
