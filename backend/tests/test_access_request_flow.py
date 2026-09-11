import asyncio

import httpx
import pytest
from fastapi import FastAPI

from app.core.auth import (
    AptusAccess,
    AuthenticatedUser,
    authenticate_user,
)
from app.domains.account import router as account_api
from app.domains.admin import router as admin_api


ASGIAsyncClient = httpx.AsyncClient
ATHLETE_ID = "22222222-2222-4222-8222-222222222222"


class FakeResponse:
    def __init__(self, status_code: int, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


def access_from(row: dict | None) -> AptusAccess | None:
    if row is None:
        return None

    return AptusAccess(
        user_id=row["user_id"],
        email=row["email"],
        status=row["status"],
        plan=row["plan"],
        role=row["role"],
        expires_at=row.get("expires_at"),
    )


def test_unknown_athlete_bootstrap_is_active_and_idempotent(
    monkeypatch,
):
    monkeypatch.setenv(
        "SUPABASE_URL",
        "https://example.supabase.co",
    )
    monkeypatch.setenv(
        "SUPABASE_PUBLISHABLE_KEY",
        "publishable-key",
    )
    test_app = FastAPI()
    test_app.include_router(account_api.router, prefix="/api/v1")
    access_rows: dict[str, dict] = {}
    posts = []

    async def athlete():
        return AuthenticatedUser(
            id=ATHLETE_ID,
            email="new@example.com",
            access_token="athlete-token",
        )

    async def access_for(user):
        return access_from(access_rows.get(user.id))

    async def onboarding_for(user):
        assert user.id == ATHLETE_ID
        return False

    class FakeAsyncClient:
        def __init__(self, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, headers, params, json):
            assert url.endswith("/rest/v1/gymos_users")
            assert headers["Authorization"] == "Bearer athlete-token"
            assert headers["Prefer"] == (
                "resolution=ignore-duplicates,"
                "return=representation"
            )
            assert params == {"on_conflict": "user_id"}
            assert json == {
                "user_id": ATHLETE_ID,
                "email": "new@example.com",
                "status": "active",
                "plan": "free",
                "role": "user",
            }
            posts.append(json)
            access_rows.setdefault(ATHLETE_ID, dict(json))
            return FakeResponse(201, [access_rows[ATHLETE_ID]])

    monkeypatch.setattr(
        account_api,
        "get_gymos_access",
        access_for,
    )
    monkeypatch.setattr(
        account_api,
        "_get_onboarding_completed",
        onboarding_for,
    )
    monkeypatch.setattr(
        account_api.httpx,
        "AsyncClient",
        FakeAsyncClient,
    )
    test_app.dependency_overrides[authenticate_user] = athlete

    async def scenario():
        async with ASGIAsyncClient(
            transport=httpx.ASGITransport(app=test_app),
            base_url="http://testserver",
        ) as client:
            created = await client.post("/api/v1/me/bootstrap")
            repeated = await client.post("/api/v1/me/bootstrap")

        assert created.status_code == 200
        assert created.json() == {
            "user_id": ATHLETE_ID,
            "email": "new@example.com",
            "access_status": "active",
            "plan": "free",
            "role": "user",
            "expires_at": None,
            "onboarding_completed": False,
        }
        assert repeated.json() == created.json()
        assert len(access_rows) == 1
        assert len(posts) == 1

    asyncio.run(scenario())


@pytest.mark.parametrize(
    ("role", "status", "plan"),
    [
        ("user", "pending", "trial"),
        ("user", "active", "pro"),
        ("admin", "active", "pro"),
        ("trainer", "active", "basic"),
    ],
)
def test_bootstrap_preserves_existing_access(
    monkeypatch,
    role,
    status,
    plan,
):
    existing = AptusAccess(
        user_id=ATHLETE_ID,
        email="existing@example.com",
        status=status,
        plan=plan,
        role=role,
        expires_at=None,
    )

    async def access_for(user):
        return existing

    async def onboarding_for(user):
        return True

    class UnexpectedClient:
        def __init__(self, timeout):
            raise AssertionError("bootstrap must not insert existing access")

    monkeypatch.setattr(
        account_api,
        "get_gymos_access",
        access_for,
    )
    monkeypatch.setattr(
        account_api,
        "_get_onboarding_completed",
        onboarding_for,
    )
    monkeypatch.setattr(
        account_api.httpx,
        "AsyncClient",
        UnexpectedClient,
    )

    result = asyncio.run(
        account_api.bootstrap_me(
            AuthenticatedUser(
                id=ATHLETE_ID,
                email="existing@example.com",
                access_token="token",
            )
        )
    )

    assert result["role"] == role
    assert result["access_status"] == status
    assert result["plan"] == plan
    assert result["onboarding_completed"] is True


def test_bootstrap_returns_row_created_by_a_concurrent_request(
    monkeypatch,
):
    monkeypatch.setenv(
        "SUPABASE_URL",
        "https://example.supabase.co",
    )
    monkeypatch.setenv(
        "SUPABASE_PUBLISHABLE_KEY",
        "publishable-key",
    )
    concurrent = AptusAccess(
        user_id=ATHLETE_ID,
        email="existing@example.com",
        status="active",
        plan="pro",
        role="admin",
        expires_at=None,
    )
    access_calls = 0

    async def access_for(user):
        nonlocal access_calls
        access_calls += 1
        return None if access_calls == 1 else concurrent

    async def onboarding_for(user):
        return True

    class ConflictIgnoredClient:
        def __init__(self, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, headers, params, json):
            assert json["role"] == "user"
            assert json["status"] == "active"
            assert json["plan"] == "free"
            return FakeResponse(201, [])

    monkeypatch.setattr(
        account_api,
        "get_gymos_access",
        access_for,
    )
    monkeypatch.setattr(
        account_api,
        "_get_onboarding_completed",
        onboarding_for,
    )
    monkeypatch.setattr(
        account_api.httpx,
        "AsyncClient",
        ConflictIgnoredClient,
    )

    result = asyncio.run(
        account_api.bootstrap_me(
            AuthenticatedUser(
                id=ATHLETE_ID,
                email="new@example.com",
                access_token="token",
            )
        )
    )

    assert access_calls == 2
    assert result["role"] == "admin"
    assert result["plan"] == "pro"


def test_admin_can_still_approve_a_legacy_pending_request(
    monkeypatch,
):
    monkeypatch.setenv(
        "SUPABASE_URL",
        "https://example.supabase.co",
    )
    monkeypatch.setenv(
        "SUPABASE_PUBLISHABLE_KEY",
        "publishable-key",
    )
    test_app = FastAPI()
    test_app.include_router(admin_api.router, prefix="/api/v1")
    row = {
        "user_id": ATHLETE_ID,
        "email": "legacy@example.com",
        "status": "pending",
        "plan": "trial",
        "role": "user",
        "expires_at": None,
        "created_at": "2026-09-10T12:00:00Z",
        "updated_at": "2026-09-10T12:00:00Z",
    }

    async def admin():
        return AuthenticatedUser(
            id="11111111-1111-4111-8111-111111111111",
            email="admin@example.com",
            access_token="admin-token",
            role="admin",
        )

    class FakeAdminClient:
        def __init__(self, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get(self, url, headers, params):
            assert params["status"] == "eq.pending"
            return FakeResponse(200, [row])

        async def patch(self, url, headers, params, json):
            assert params["user_id"] == f"eq.{ATHLETE_ID}"
            assert params["status"] == "eq.pending"
            assert "user_id" in params["select"]
            assert json == {"status": "active"}
            row["status"] = "active"
            return FakeResponse(200, [row])

    monkeypatch.setattr(
        admin_api.httpx,
        "AsyncClient",
        FakeAdminClient,
    )
    test_app.dependency_overrides[admin_api.require_admin] = admin

    async def scenario():
        async with ASGIAsyncClient(
            transport=httpx.ASGITransport(app=test_app),
            base_url="http://testserver",
        ) as client:
            requests = await client.get(
                "/api/v1/admin/access-requests"
            )
            approved = await client.patch(
                f"/api/v1/admin/access-requests/{ATHLETE_ID}",
                json={"status": "active"},
            )

        assert requests.status_code == 200
        assert requests.json()[0]["status"] == "pending"
        assert approved.status_code == 200
        assert approved.json()["status"] == "active"

    asyncio.run(scenario())
