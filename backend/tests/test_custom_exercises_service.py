import asyncio

from auth import AuthenticatedUser
from app.models.custom_exercise import CustomExerciseCreate
from app.services import custom_exercises as service


def test_register_custom_exercise_maps_repository_row(monkeypatch):
    async def fake_create_custom_exercise(user, payload):
        assert user.id == "user-123"
        assert payload.name == "Press personalizado"

        return {
            "id": 42,
            "name": "Press personalizado",
            "muscle": "Pecho",
            "equipment": "Mancuernas",
            "type": "Fuerza",
            "notes": "Controlar la bajada.",
            "category": "strength",
            "record_types": ["weight", "reps"],
        }

    monkeypatch.setattr(
        service,
        "create_custom_exercise",
        fake_create_custom_exercise,
    )

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="token-123",
    )

    payload = CustomExerciseCreate(
        name="Press personalizado",
        muscle="Pecho",
        equipment="Mancuernas",
        type="Fuerza",
        notes="Controlar la bajada.",
        category="strength",
        recordTypes=["weight", "reps"],
    )

    exercise = asyncio.run(
        service.register_custom_exercise(user, payload)
    )

    assert exercise.model_dump() == {
        "id": "custom-42",
        "name": "Press personalizado",
        "muscle": "Pecho",
        "equipment": "Mancuernas",
        "type": "Fuerza",
        "favorite": False,
        "custom": True,
        "notes": "Controlar la bajada.",
        "category": "strength",
        "recordTypes": ["weight", "reps"],
    }
