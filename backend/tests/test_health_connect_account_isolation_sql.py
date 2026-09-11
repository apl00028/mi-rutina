from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_health_connect_integration_is_user_scoped():
    sql = (
        ROOT
        / "database"
        / "supabase"
        / "health-connect-account-integrations.sql"
    ).read_text()

    assert "user_id = (select auth.uid())" in sql
    assert "provider in ('health_connect')" in sql
    assert "primary key (user_id, provider)" in sql


def test_health_connect_sync_routes_are_guarded():
    running = (
        ROOT
        / "backend/app/domains/running/router.py"
    ).read_text()

    swimming = (
        ROOT
        / "backend/app/domains/swimming/router.py"
    ).read_text()

    assert (
        "await require_health_connect_enabled(user)"
        in running
    )

    assert (
        "await require_health_connect_enabled(user)"
        in swimming
    )
