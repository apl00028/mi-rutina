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
    assert "discipline text generated always as" in sql
    assert "coalesce(nullif(data->>'discipline', ''), 'strength')" in sql
    assert "unique (user_id, id, discipline)" in sql
    assert "alter table public.routines enable row level security" in sql
    assert "for select" in sql
    assert "for insert" in sql
    assert "for update" in sql
    assert "using ((select auth.uid()) = user_id)" in sql
    assert "with check ((select auth.uid()) = user_id)" in sql


def test_active_routines_bootstrap_is_safe_and_discipline_aware():
    sql = (
        Path(__file__).resolve().parents[2]
        / "database"
        / "supabase"
        / "active-routines.sql"
    ).read_text(encoding="utf-8")

    assert "drop table" not in sql.lower()
    assert "create table if not exists public.active_routines" in sql
    assert "primary key (user_id, discipline)" in sql
    assert "foreign key (user_id, routine_id, discipline)" in sql
    assert "references public.routines(user_id, id, discipline)" in sql


def test_active_routines_integrity_migration_uses_effective_discipline():
    sql = (
        Path(__file__).resolve().parents[2]
        / "database"
        / "supabase"
        / "active-routines-discipline-integrity.sql"
    ).read_text(encoding="utf-8")

    assert "coalesce(nullif(data->>'discipline', ''), 'strength')" in sql
    assert "delete from public.active_routines" in sql
    assert "ar.discipline <> r.discipline" in sql
    assert "foreign key (user_id, routine_id, discipline)" in sql
    assert "references public.routines(user_id, id, discipline)" in sql
