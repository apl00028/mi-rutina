from fastapi.testclient import TestClient

from app.core.auth import (
    AuthenticatedUser,
    authenticate_user,
)
from main import app


client = TestClient(app)


async def authenticated_user():
    return AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="token-123",
    )


def test_me_requires_authentication():
    response = client.get("/api/v1/me")

    assert response.status_code == 401
    assert response.json() == {
        "detail": "Missing bearer token"
    }


def test_me_returns_authenticated_identity(monkeypatch):
    from app.domains.account import router as me_api

    async def fake_get_gymos_access(user):
        assert user.id == "user-123"
        return type(
            "Access",
            (),
            {
                "status": "active",
                "plan": "trial",
                "role": "user",
                "expires_at": None,
            },
        )()

    async def fake_onboarding_completed(user):
        assert user.id == "user-123"
        return True

    app.dependency_overrides[
        authenticate_user
    ] = authenticated_user
    monkeypatch.setattr(
        me_api,
        "get_gymos_access",
        fake_get_gymos_access,
    )
    monkeypatch.setattr(
        me_api,
        "_get_onboarding_completed",
        fake_onboarding_completed,
    )

    try:
        response = client.get(
            "/api/v1/me",
            headers={
                "Authorization":
                    "Bearer token-123"
            },
        )
    finally:
        app.dependency_overrides.pop(
            authenticate_user,
            None,
        )

    assert response.status_code == 200
    assert response.json() == {
        "user_id": "user-123",
        "email": "test@example.com",
        "access_status": "active",
        "plan": "trial",
        "role": "user",
        "expires_at": None,
        "onboarding_completed": True,
    }


def test_me_rejects_invalid_token(monkeypatch):
    import app.core.auth as auth

    monkeypatch.setenv(
        "SUPABASE_URL",
        "https://example.supabase.co",
    )
    monkeypatch.setenv(
        "SUPABASE_PUBLISHABLE_KEY",
        "publishable-key",
    )

    class FakeResponse:
        status_code = 401

        def json(self):
            return {
                "message": "invalid token"
            }

    class FakeClient:
        def __init__(self, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(
            self,
            exc_type,
            exc,
            tb,
        ):
            pass

        async def get(
            self,
            url,
            headers,
        ):
            assert url == (
                "https://example.supabase.co"
                "/auth/v1/user"
            )
            assert headers == {
                "Authorization":
                    "Bearer bad-token",
                "apikey":
                    "publishable-key",
            }
            return FakeResponse()

    monkeypatch.setattr(
        auth,
        "get_supabase_http_client",
        lambda: FakeClient(
            timeout=10.0
        ),
    )

    response = client.get(
        "/api/v1/me",
        headers={
            "Authorization":
                "Bearer bad-token"
        },
    )

    assert response.status_code == 401
    assert response.json() == {
        "detail":
            "Invalid or expired access token"
    }


def test_delete_me_requires_authentication():
    response = client.delete(
        "/api/v1/me"
    )

    assert response.status_code == 401


def test_delete_me_deletes_authenticated_account(
    monkeypatch,
):
    from app.domains.account import (
        router as me_api,
    )

    deleted = []

    async def fake_delete_account(user):
        deleted.append(user.id)

    app.dependency_overrides[
        authenticate_user
    ] = authenticated_user

    monkeypatch.setattr(
        me_api,
        "delete_account",
        fake_delete_account,
    )

    try:
        response = client.delete(
            "/api/v1/me",
            headers={
                "Authorization":
                    "Bearer token-123"
            },
        )
    finally:
        app.dependency_overrides.pop(
            authenticate_user,
            None,
        )

    assert response.status_code == 204
    assert response.content == b""
    assert deleted == [
        "user-123"
    ]


def test_delete_account_removes_data_before_auth(
    monkeypatch,
):
    from app.domains.account import (
        deletion_service,
    )

    calls = []

    async def fake_delete_user_data(
        user_id,
    ):
        calls.append(
            ("data", user_id)
        )

    async def fake_delete_auth_user(
        user_id,
    ):
        calls.append(
            ("auth", user_id)
        )

    monkeypatch.setattr(
        deletion_service,
        "_delete_user_data",
        fake_delete_user_data,
    )

    monkeypatch.setattr(
        deletion_service,
        "_delete_auth_user",
        fake_delete_auth_user,
    )

    awaitable = (
        deletion_service.delete_account(
            AuthenticatedUser(
                id="user-123",
                email="test@example.com",
                access_token="token-123",
            )
        )
    )

    import asyncio
    asyncio.run(awaitable)

    assert calls == [
        ("data", "user-123"),
        ("auth", "user-123"),
    ]


def test_me_loads_access_and_onboarding_concurrently(
    monkeypatch,
):
    import asyncio

    from app.domains.account import (
        router as me_api,
    )

    events = []

    async def fake_get_gymos_access(user):
        events.append("access_started")

        await asyncio.sleep(0)

        events.append("access_finished")

        return type(
            "Access",
            (),
            {
                "status": "active",
                "plan": "trial",
                "role": "user",
                "expires_at": None,
            },
        )()

    async def fake_onboarding_completed(user):
        events.append("onboarding_started")

        await asyncio.sleep(0)

        events.append("onboarding_finished")

        return True

    monkeypatch.setattr(
        me_api,
        "get_gymos_access",
        fake_get_gymos_access,
    )

    monkeypatch.setattr(
        me_api,
        "_get_onboarding_completed",
        fake_onboarding_completed,
    )

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="token-123",
    )

    result = asyncio.run(
        me_api.get_me(user)
    )

    assert result[
        "access_status"
    ] == "active"

    assert result[
        "onboarding_completed"
    ] is True

    last_start = max(
        events.index("access_started"),
        events.index("onboarding_started"),
    )

    first_finish = min(
        events.index("access_finished"),
        events.index("onboarding_finished"),
    )

    assert last_start < first_finish
