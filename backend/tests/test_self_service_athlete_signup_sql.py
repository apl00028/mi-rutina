from pathlib import Path


SQL_FILE = (
    Path(__file__).resolve().parents[2]
    / "database"
    / "supabase"
    / "self-service-athlete-signup.sql"
)


def test_signup_migration_allows_only_own_active_free_user():
    sql = SQL_FILE.read_text(encoding="utf-8").lower()

    assert "'free', 'trial', 'basic', 'pro'" in sql
    assert "drop policy if exists gymos_users_insert_own_pending" in sql
    assert "user_id = (select auth.uid())" in sql
    assert "role = 'user'" in sql
    assert "status = 'active'" in sql
    assert "plan = 'free'" in sql
    assert "expires_at is null" in sql
