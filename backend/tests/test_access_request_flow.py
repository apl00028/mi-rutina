import asyncio

import httpx
from fastapi import FastAPI

from app.core.auth import (
    AptusAccess,
    AuthenticatedUser,
    authenticate_user,
)
from app.domains.account import router as account_api
from app.domains.admin import router as admin_api


ASGIAsyncClient = httpx.AsyncClient


class FakeResponse:
    def __init__(self, status_code: int, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


def test_new_user_pending_approval_flow(monkeypatch):
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
    test_app.include_router(admin_api.router, prefix="/api/v1")
    access_rows: dict[str, dict] = {}
    profile_users: set[str] = set()
    athlete_id = "22222222-2222-4222-8222-222222222222"

    async def athlete():
        return AuthenticatedUser(
            id=athlete_id,
            email="new@example.com",
            access_token="athlete-token",
        )

    async def admin():
        return AuthenticatedUser(
            id="11111111-1111-4111-8111-111111111111",
            email="admin@example.com",
            access_token="admin-token",
            role="admin",
        )

    async def access_for(user):
        row = access_rows.get(user.id)
        if row is None:
            return None
        return AptusAccess(
            user_id=row["user_id"],
            email=row["email"],
            status=row["status"],
            plan=row["plan"],
            role=row["role"],
            expires_at=None,
        )

    async def onboarding_for(user):
        return False

    async def ensure_profile(user):
        profile_users.add(user.id)

    class FakeAsyncClient:
        def __init__(self, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, headers, json):
            assert url.endswith("/rest/v1/gymos_users")
            assert headers["Authorization"] == "Bearer athlete-token"
            assert json == {
                "user_id": athlete_id,
                "email": "new@example.com",
                "status": "pending",
                "plan": "trial",
                "role": "user",
            }
            row = {
                **json,
                "created_at": "2026-09-10T12:00:00Z",
                "updated_at": "2026-09-10T12:00:00Z",
            }
            access_rows[athlete_id] = row
            return FakeResponse(201, [row])

        async def get(self, url, headers, params):
            assert url.endswith("/rest/v1/gymos_users")
            assert headers["Authorization"] == "Bearer admin-token"
            rows = [
                row for row in access_rows.values()
                if row["status"] == "pending"
            ]
            return FakeResponse(200, rows)

        async def patch(self, url, headers, params, json):
            assert url.endswith("/rest/v1/gymos_users")
            assert headers["Authorization"] == "Bearer admin-token"
            row = access_rows.get(athlete_id)
            if row is None or row["status"] != "pending":
                return FakeResponse(200, [])
            row = {**row, "status": json["status"]}
            access_rows[athlete_id] = row
            return FakeResponse(200, [row])

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
        account_api,
        "_ensure_training_profile",
        ensure_profile,
    )
    monkeypatch.setattr(
        account_api.httpx,
        "AsyncClient",
        FakeAsyncClient,
    )

    test_app.dependency_overrides[authenticate_user] = athlete
    test_app.dependency_overrides[admin_api.require_admin] = admin

    async def scenario():
        async with ASGIAsyncClient(
            transport=httpx.ASGITransport(app=test_app),
            base_url="http://testserver",
        ) as client:
            unknown = await client.get("/api/v1/me")
            assert unknown.status_code == 200
            assert unknown.json()["access_status"] == "unregistered"

            pending = await client.post("/api/v1/me/bootstrap")
            assert pending.status_code == 200
            assert pending.json()["access_status"] == "pending"
            assert pending.json()["role"] == "user"
            assert athlete_id in profile_users

            requests = await client.get(
                "/api/v1/admin/access-requests"
            )
            assert requests.status_code == 200
            assert [row["user_id"] for row in requests.json()] == [
                athlete_id
            ]

            approved = await client.patch(
                f"/api/v1/admin/access-requests/{athlete_id}",
                json={"status": "active"},
            )
            assert approved.status_code == 200
            assert approved.json()["status"] == "active"

            resolved = await client.get("/api/v1/me")
            assert resolved.status_code == 200
            assert resolved.json()["access_status"] == "active"
            assert resolved.json()["role"] == "user"
            assert resolved.json()["onboarding_completed"] is False

    asyncio.run(scenario())
