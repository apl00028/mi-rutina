from pathlib import Path


def test_exercise_favorites_sql_includes_rls_policies():
    sql = (
        Path(__file__).resolve().parents[2]
        / "database"
        / "supabase"
        / "exercise-favorites.sql"
    ).read_text(encoding="utf-8")

    assert "create table if not exists public.exercise_favorites" in sql
    assert "primary key (user_id, exercise_id)" in sql
    assert "alter table public.exercise_favorites enable row level security" in sql
    assert "for select" in sql
    assert "for insert" in sql
    assert "for delete" in sql
    assert "using ((select auth.uid()) = user_id)" in sql
    assert "with check ((select auth.uid()) = user_id)" in sql
