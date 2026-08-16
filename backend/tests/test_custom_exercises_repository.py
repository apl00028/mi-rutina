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
