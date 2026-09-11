from pathlib import Path


SQL_FILE = (
    Path(__file__).resolve().parents[2]
    / "database"
    / "supabase"
    / "self-service-trainer-signup.sql"
)


def test_signup_migration_allows_only_safe_self_service_roles():
    sql = SQL_FILE.read_text(encoding="utf-8").lower()

    assert "role in ('user', 'trainer')" in sql
    assert "user_id = (select auth.uid())" in sql
    assert "status = 'active'" in sql
    assert "plan = 'free'" in sql
    assert "expires_at is null" in sql
    assert "'admin'" not in sql
