import asyncio

from auth import AuthenticatedUser
from app.repositories import exercise_favorites as repository


def test_list_favorite_exercise_ids_filters_authenticated_user(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "publishable-key")

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [
                {"exercise_id": "bench-press"},
                {"exercise_id": "custom-11111111-2222-3333-4444-555555555555"},
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

    favorites = asyncio.run(repository.list_favorite_exercise_ids(user))

    assert favorites == {
        "bench-press",
        "custom-11111111-2222-3333-4444-555555555555",
    }
    assert captured["url"] == (
        "https://example.supabase.co/rest/v1/exercise_favorites"
    )
    assert captured["headers"] == {
        "Authorization": "Bearer access-token",
        "apikey": "publishable-key",
    }
    assert captured["params"] == {
        "select": "exercise_id",
        "user_id": "eq.user-123",
    }


def test_add_favorite_uses_user_auth_and_idempotent_upsert(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "publishable-key")

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            pass

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

        async def post(self, url, headers, params, json):
            captured["url"] = url
            captured["headers"] = headers
            captured["params"] = params
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(repository.httpx, "AsyncClient", FakeClient)

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="access-token",
    )

    asyncio.run(repository.add_favorite(user, "bench-press"))

    assert captured["url"] == (
        "https://example.supabase.co/rest/v1/exercise_favorites"
    )
    assert captured["headers"] == {
        "Authorization": "Bearer access-token",
        "apikey": "publishable-key",
        "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates",
    }
    assert captured["params"] == {
        "on_conflict": "user_id,exercise_id",
    }
    assert captured["json"] == {
        "user_id": "user-123",
        "exercise_id": "bench-press",
    }


def test_remove_favorite_filters_authenticated_user(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "publishable-key")

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            pass

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

        async def delete(self, url, headers, params):
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

    asyncio.run(repository.remove_favorite(user, "bench-press"))

    assert captured["url"] == (
        "https://example.supabase.co/rest/v1/exercise_favorites"
    )
    assert captured["headers"] == {
        "Authorization": "Bearer access-token",
        "apikey": "publishable-key",
    }
    assert captured["params"] == {
        "user_id": "eq.user-123",
        "exercise_id": "eq.bench-press",
    }
