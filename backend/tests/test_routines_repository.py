import asyncio

from auth import AuthenticatedUser
from app.repositories import routines as repository


def test_list_routines_filters_authenticated_user(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "publishable-key")

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [
                {
                    "id": "routine-1",
                    "user_id": "user-123",
                    "data": {
                        "schemaVersion": "4.2",
                        "routineId": "routine-1",
                        "revision": 1,
                        "sessions": [],
                    },
                }
            ]

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

        async def get(self, url, headers, params):
            captured["url"] = url
            captured["headers"] = headers
            captured["params"] = params
            return FakeResponse()

    monkeypatch.setattr(repository.httpx, "AsyncClient", FakeClient)

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="access-token",
    )

    rows = asyncio.run(repository.list_routines(user))

    assert rows[0]["id"] == "routine-1"
    assert captured["url"] == "https://example.supabase.co/rest/v1/routines"
    assert captured["headers"] == {
        "Authorization": "Bearer access-token",
        "apikey": "publishable-key",
    }
    assert captured["params"] == {
        "user_id": "eq.user-123",
        "order": "updated_at.desc",
    }


def test_get_routine_filters_id_and_authenticated_user(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "publishable-key")

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [
                {
                    "id": "routine-1",
                    "user_id": "user-123",
                    "data": {
                        "schemaVersion": "4.2",
                        "routineId": "routine-1",
                        "revision": 1,
                        "sessions": [],
                    },
                }
            ]

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

        async def get(self, url, headers, params):
            captured["url"] = url
            captured["headers"] = headers
            captured["params"] = params
            return FakeResponse()

    monkeypatch.setattr(repository.httpx, "AsyncClient", FakeClient)

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="access-token",
    )

    row = asyncio.run(repository.get_routine_by_id(user, "routine-1"))

    assert row["id"] == "routine-1"
    assert captured["params"] == {
        "id": "eq.routine-1",
        "user_id": "eq.user-123",
        "limit": "1",
    }


def test_get_routine_empty_result_returns_none(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "publishable-key")

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return []

    class FakeClient:
        def __init__(self, timeout):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

        async def get(self, url, headers, params):
            return FakeResponse()

    monkeypatch.setattr(repository.httpx, "AsyncClient", FakeClient)

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="access-token",
    )

    row = asyncio.run(repository.get_routine_by_id(user, "routine-1"))

    assert row is None
