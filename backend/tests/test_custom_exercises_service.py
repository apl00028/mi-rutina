import asyncio

from app.core.auth import AuthenticatedUser
from app.domains.exercises.schemas import CustomExerciseCreate, CustomExerciseUpdate
from app.domains.exercises import custom_service as service


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


def test_list_custom_exercise_models_reuses_row_mapper(monkeypatch):
    async def fake_list_custom_exercises(user):
        assert user.id == "user-123"

        return [
            {
                "id": "11111111-2222-3333-4444-555555555555",
                "name": "Press personalizado",
                "muscle": "Pecho",
                "equipment": "Mancuernas",
                "type": "Fuerza",
                "notes": "Controlar la bajada.",
                "category": "strength",
                "record_types": ["weight", "reps"],
            }
        ]

    monkeypatch.setattr(
        service,
        "list_custom_exercises",
        fake_list_custom_exercises,
    )

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="token-123",
    )

    exercises = asyncio.run(service.list_custom_exercise_models(user))

    assert [exercise.model_dump() for exercise in exercises] == [
        {
            "id": "custom-11111111-2222-3333-4444-555555555555",
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
    ]


def test_get_custom_exercise_model_by_id_reuses_row_mapper(monkeypatch):
    async def fake_get_custom_exercise_by_id(user, exercise_id):
        assert user.id == "user-123"
        assert exercise_id == "custom-11111111-2222-3333-4444-555555555555"

        return {
            "id": "11111111-2222-3333-4444-555555555555",
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
        "get_custom_exercise_by_id",
        fake_get_custom_exercise_by_id,
    )

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="token-123",
    )

    exercise = asyncio.run(
        service.get_custom_exercise_model_by_id(
            user,
            "custom-11111111-2222-3333-4444-555555555555",
        )
    )

    assert exercise.model_dump() == {
        "id": "custom-11111111-2222-3333-4444-555555555555",
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


def test_update_custom_exercise_model_sends_only_patch_fields(monkeypatch):
    captured = {}

    async def fake_update_custom_exercise(user, exercise_id, changes):
        captured["user_id"] = user.id
        captured["exercise_id"] = exercise_id
        captured["changes"] = changes

        return {
            "id": "11111111-2222-3333-4444-555555555555",
            "name": "Press editado",
            "muscle": "Pecho",
            "equipment": "Mancuernas",
            "type": "Fuerza",
            "notes": "Controlar la bajada.",
            "category": "strength",
            "record_types": ["weight", "reps"],
        }

    monkeypatch.setattr(
        service,
        "update_custom_exercise",
        fake_update_custom_exercise,
    )

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="token-123",
    )

    payload = CustomExerciseUpdate(
        name="Press editado",
        recordTypes=["weight", "reps"],
    )

    exercise = asyncio.run(
        service.update_custom_exercise_model(
            user,
            "custom-11111111-2222-3333-4444-555555555555",
            payload,
        )
    )

    assert captured == {
        "user_id": "user-123",
        "exercise_id": "custom-11111111-2222-3333-4444-555555555555",
        "changes": {
            "name": "Press editado",
            "recordTypes": ["weight", "reps"],
        },
    }
    assert exercise.model_dump() == {
        "id": "custom-11111111-2222-3333-4444-555555555555",
        "name": "Press editado",
        "muscle": "Pecho",
        "equipment": "Mancuernas",
        "type": "Fuerza",
        "favorite": False,
        "custom": True,
        "notes": "Controlar la bajada.",
        "category": "strength",
        "recordTypes": ["weight", "reps"],
    }


def test_remove_custom_exercise_delegates_to_repository(monkeypatch):
    captured = {}

    async def fake_delete_custom_exercise(user, exercise_id):
        captured["user_id"] = user.id
        captured["exercise_id"] = exercise_id
        return True

    monkeypatch.setattr(
        service,
        "delete_custom_exercise",
        fake_delete_custom_exercise,
    )

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="token-123",
    )

    deleted = asyncio.run(
        service.remove_custom_exercise(
            user,
            "custom-11111111-2222-3333-4444-555555555555",
        )
    )

    assert deleted is True
    assert captured == {
        "user_id": "user-123",
        "exercise_id": "custom-11111111-2222-3333-4444-555555555555",
    }
