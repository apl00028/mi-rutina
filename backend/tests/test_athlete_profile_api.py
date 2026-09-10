import asyncio

import httpx

from app.core.auth import AuthenticatedUser, require_user
from main import app


USER_ID = "22222222-2222-4222-8222-222222222222"


def call(method: str, *, role="user", body=None):
    async def actor():
        return AuthenticatedUser(
            id=USER_ID,
            email="athlete@example.com",
            access_token="token-123",
            role=role,
        )

    async def send():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            return await client.request(
                method,
                "/api/v1/athlete-profile",
                json=body,
                headers={"Authorization": "Bearer token-123"},
            )

    app.dependency_overrides[require_user] = actor
    try:
        return asyncio.run(send())
    finally:
        app.dependency_overrides.pop(require_user, None)


def row(**overrides):
    return {
        "user_id": USER_ID,
        "experience_level": "intermediate",
        "weekly_availability": 4,
        "session_duration_min": 60,
        "injuries": ["Rodilla sensible"],
        "pain_areas": ["rodilla"],
        **overrides,
    }


class Response:
    def __init__(self, rows, status_code=200):
        self.rows = rows
        self.status_code = status_code
        self.request = httpx.Request("GET", "https://example.test")

    def json(self):
        return self.rows

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                "failed", request=self.request,
                response=httpx.Response(self.status_code, request=self.request),
            )


def configure(monkeypatch, *, get_rows=None, patch_rows=None):
    from app.domains.athlete_profile import router as profile_api

    calls = []

    class Client:
        async def get(self, url, **kwargs):
            calls.append(("get", url, kwargs))
            return Response(get_rows if get_rows is not None else [])

        async def patch(self, url, **kwargs):
            calls.append(("patch", url, kwargs))
            return Response(patch_rows if patch_rows is not None else [])

    monkeypatch.setattr(profile_api, "_supabase_config", lambda: ("https://example.supabase.co", "key"))
    monkeypatch.setattr(profile_api, "get_supabase_http_client", lambda: Client())
    return calls


def test_reads_owner_profile(monkeypatch):
    calls = configure(monkeypatch, get_rows=[row()])
    response = call("GET")
    assert response.status_code == 200
    assert response.json()["weekly_availability"] == 4
    assert calls[0][2]["params"]["user_id"] == f"eq.{USER_ID}"
    assert calls[0][2]["headers"]["Authorization"] == "Bearer token-123"


def test_missing_profile_is_valid(monkeypatch):
    configure(monkeypatch, get_rows=[])
    response = call("GET")
    assert response.status_code == 200
    assert response.json() is None


def test_updates_only_supported_fields_without_routine_side_effects(monkeypatch):
    calls = configure(monkeypatch, patch_rows=[row(weekly_availability=3)])
    response = call("PATCH", body={
        "weekly_availability": 3,
        "session_duration_min": 45,
        "injuries": [],
        "pain_areas": ["hombro"],
    })
    assert response.status_code == 200
    patch = calls[0]
    assert patch[2]["json"] == {
        "weekly_availability": 3,
        "session_duration_min": 45,
        "injuries": [],
        "pain_areas": ["hombro"],
    }
    assert "routine" not in patch[1]
    assert "primary_goal" not in patch[2]["json"]


def test_profile_validation_and_extra_fields(monkeypatch):
    configure(monkeypatch)
    assert call("PATCH", body={"weekly_availability": 1}).status_code == 422
    assert call("PATCH", body={"injuries": None}).status_code == 422
    assert call("PATCH", body={"pain_areas": None}).status_code == 422
    assert call("PATCH", body={"primary_goal": "fat_loss"}).status_code == 422
    assert call("PATCH", body={}).status_code == 422


def test_trainers_cannot_read_or_edit_athlete_profile(monkeypatch):
    calls = configure(monkeypatch, get_rows=[row()], patch_rows=[row()])
    assert call("GET", role="trainer").status_code == 403
    assert call("PATCH", role="trainer", body={"weekly_availability": 3}).status_code == 403
    assert calls == []


def test_update_does_not_create_an_unknown_profile(monkeypatch):
    configure(monkeypatch, patch_rows=[])
    response = call("PATCH", body={"weekly_availability": 3})
    assert response.status_code == 404


def test_backend_failure_is_not_an_empty_profile(monkeypatch):
    from app.domains.athlete_profile import router as profile_api

    class Client:
        async def get(self, *args, **kwargs):
            raise httpx.ConnectError("offline")

    monkeypatch.setattr(profile_api, "_supabase_config", lambda: ("https://example.supabase.co", "key"))
    monkeypatch.setattr(profile_api, "get_supabase_http_client", lambda: Client())
    response = call("GET")
    assert response.status_code == 503
