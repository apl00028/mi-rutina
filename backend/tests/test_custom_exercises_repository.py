import asyncio

from auth import AuthenticatedUser
from app.models.custom_exercise import CustomExerciseCreate
from app.repositories import custom_exercises as repository


def test_create_custom_exercise_posts_expected_payload(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "publishable-key")

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [
                {
                    "id": 42,
                    "user_id": "user-123",
                    "name": "Press personalizado",
                    "muscle": "Pecho",
                    "equipment": "Mancuernas",
                    "type": "Fuerza",
                    "notes": "Controlar la bajada.",
                    "category": "strength",
                    "record_types": ["weight", "reps"],
                }
            ]

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

        async def post(self, url, headers, json):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(repository.httpx, "AsyncClient", FakeClient)

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="access-token",
    )

    payload = CustomExerciseCreate(
        name="  Press personalizado  ",
        muscle="  Pecho  ",
        equipment="  Mancuernas  ",
        type="  Fuerza  ",
        notes="Controlar la bajada.",
        category="  strength  ",
        recordTypes=["weight", "reps"],
    )

    row = asyncio.run(
        repository.create_custom_exercise(user, payload)
    )

    assert captured["url"] == (
        "https://example.supabase.co/rest/v1/custom_exercises"
    )
    assert captured["headers"] == {
        "Authorization": "Bearer access-token",
        "apikey": "publishable-key",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    assert captured["json"] == {
        "user_id": "user-123",
        "name": "Press personalizado",
        "muscle": "Pecho",
        "equipment": "Mancuernas",
        "type": "Fuerza",
        "notes": "Controlar la bajada.",
        "category": "strength",
        "record_types": ["weight", "reps"],
    }
    assert row["id"] == 42


def test_list_custom_exercises_gets_only_authenticated_user(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "publishable-key")

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [
                {
                    "id": "11111111-2222-3333-4444-555555555555",
                    "user_id": "user-123",
                    "name": "Press personalizado",
                    "muscle": "Pecho",
                    "equipment": "Mancuernas",
                    "type": "Fuerza",
                    "notes": "Controlar la bajada.",
                    "category": "strength",
                    "record_types": ["weight", "reps"],
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

    rows = asyncio.run(repository.list_custom_exercises(user))

    assert captured["url"] == (
        "https://example.supabase.co/rest/v1/custom_exercises"
    )
    assert captured["headers"] == {
        "Authorization": "Bearer access-token",
        "apikey": "publishable-key",
    }
    assert captured["params"] == {
        "user_id": "eq.user-123",
        "order": "created_at.asc",
    }
    assert rows[0]["user_id"] == "user-123"


def test_get_custom_exercise_by_id_filters_id_and_authenticated_user(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "publishable-key")

    captured = {}
    custom_uuid = "11111111-2222-3333-4444-555555555555"

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [
                {
                    "id": custom_uuid,
                    "user_id": "user-123",
                    "name": "Press personalizado",
                    "muscle": "Pecho",
                    "equipment": "Mancuernas",
                    "type": "Fuerza",
                    "notes": "Controlar la bajada.",
                    "category": "strength",
                    "record_types": ["weight", "reps"],
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

    row = asyncio.run(
        repository.get_custom_exercise_by_id(user, f"custom-{custom_uuid}")
    )

    assert captured["url"] == (
        "https://example.supabase.co/rest/v1/custom_exercises"
    )
    assert captured["headers"] == {
        "Authorization": "Bearer access-token",
        "apikey": "publishable-key",
    }
    assert captured["params"] == {
        "id": f"eq.{custom_uuid}",
        "user_id": "eq.user-123",
        "limit": "1",
    }
    assert row["id"] == custom_uuid


def test_get_custom_exercise_by_invalid_uuid_returns_none_without_http(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "publishable-key")

    class FakeClient:
        def __init__(self, timeout):
            raise AssertionError("Supabase should not be queried")

    monkeypatch.setattr(repository.httpx, "AsyncClient", FakeClient)

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="access-token",
    )

    row = asyncio.run(
        repository.get_custom_exercise_by_id(user, "custom-not-a-uuid")
    )

    assert row is None


def test_update_custom_exercise_patches_expected_payload_and_filters(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "publishable-key")

    captured = {}
    custom_uuid = "11111111-2222-3333-4444-555555555555"

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [
                {
                    "id": custom_uuid,
                    "user_id": "user-123",
                    "name": "Press editado",
                    "muscle": "Pecho",
                    "equipment": "Mancuernas",
                    "type": "Fuerza",
                    "notes": "Nota existente.",
                    "category": "strength",
                    "record_types": ["weight", "reps"],
                }
            ]

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

        async def patch(self, url, headers, params, json):
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

    row = asyncio.run(
        repository.update_custom_exercise(
            user,
            f"custom-{custom_uuid}",
            {
                "name": "  Press editado  ",
                "recordTypes": ["weight", "reps"],
            },
        )
    )

    assert captured["url"] == (
        "https://example.supabase.co/rest/v1/custom_exercises"
    )
    assert captured["headers"] == {
        "Authorization": "Bearer access-token",
        "apikey": "publishable-key",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    assert captured["params"] == {
        "id": f"eq.{custom_uuid}",
        "user_id": "eq.user-123",
    }
    assert captured["json"] == {
        "name": "Press editado",
        "record_types": ["weight", "reps"],
    }
    assert row["id"] == custom_uuid


def test_update_custom_exercise_empty_result_returns_none(monkeypatch):
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

        async def patch(self, url, headers, params, json):
            return FakeResponse()

    monkeypatch.setattr(repository.httpx, "AsyncClient", FakeClient)

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="access-token",
    )

    row = asyncio.run(
        repository.update_custom_exercise(
            user,
            "custom-11111111-2222-3333-4444-555555555555",
            {"name": "Press editado"},
        )
    )

    assert row is None


def test_update_custom_exercise_invalid_uuid_returns_none_without_http(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "publishable-key")

    class FakeClient:
        def __init__(self, timeout):
            raise AssertionError("Supabase should not be queried")

    monkeypatch.setattr(repository.httpx, "AsyncClient", FakeClient)

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="access-token",
    )

    row = asyncio.run(
        repository.update_custom_exercise(
            user,
            "custom-not-a-uuid",
            {"name": "Press editado"},
        )
    )

    assert row is None
