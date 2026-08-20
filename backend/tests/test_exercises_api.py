import httpx
from fastapi.testclient import TestClient
from fastapi.encoders import jsonable_encoder

from app.core.auth import AuthenticatedUser, require_user
from app.domains.exercises.service import load_exercises
from main import app


client = TestClient(app)


async def authenticated_user():
    return AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="token-123",
    )


async def no_favorites(user):
    assert user.id == "user-123"
    return set()


def test_list_exercises_requires_authentication():
    response = client.get("/api/v1/exercises")

    assert response.status_code == 401
    assert response.json() == {"detail": "Missing bearer token"}


def test_list_exercises_authenticated_without_custom_returns_100_items(monkeypatch):
    from app.domains.exercises import router as exercises_api

    async def fake_list_custom_exercise_models(user):
        assert user.id == "user-123"
        return []

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "list_custom_exercise_models",
        fake_list_custom_exercise_models,
    )
    monkeypatch.setattr(
        exercises_api,
        "list_user_favorite_exercise_ids",
        no_favorites,
    )

    try:
        response = client.get(
            "/api/v1/exercises",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 200

    data = response.json()

    assert len(data) == 100
    assert len({exercise["id"] for exercise in data}) == 100
    assert data == jsonable_encoder(
        [
            exercise.model_copy(update={"favorite": False})
            for exercise in load_exercises()
        ],
        exclude_none=True,
    )


def test_list_exercises_authenticated_marks_builtin_favorite(monkeypatch):
    from app.domains.exercises import router as exercises_api

    async def fake_list_custom_exercise_models(user):
        return []

    async def fake_list_user_favorite_exercise_ids(user):
        assert user.id == "user-123"
        return {"bench-press"}

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "list_custom_exercise_models",
        fake_list_custom_exercise_models,
    )
    monkeypatch.setattr(
        exercises_api,
        "list_user_favorite_exercise_ids",
        fake_list_user_favorite_exercise_ids,
    )

    try:
        response = client.get(
            "/api/v1/exercises",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 200

    exercises = {
        exercise["id"]: exercise
        for exercise in response.json()
    }
    assert exercises["bench-press"]["favorite"] is True
    assert exercises["back-squat"]["favorite"] is False


def test_list_exercises_authenticated_appends_custom_exercise(monkeypatch):
    from app.domains.exercises import router as exercises_api
    from app.domains.exercises.models import Exercise

    custom_uuid = "11111111-2222-3333-4444-555555555555"

    async def fake_list_custom_exercise_models(user):
        assert user.id == "user-123"
        return [
            Exercise(
                id=f"custom-{custom_uuid}",
                name="Press personalizado",
                muscle="Pecho",
                equipment="Mancuernas",
                type="Fuerza",
                favorite=False,
                custom=True,
                notes="Controlar la bajada.",
                category="strength",
                recordTypes=["weight", "reps"],
            )
        ]

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "list_custom_exercise_models",
        fake_list_custom_exercise_models,
    )
    monkeypatch.setattr(
        exercises_api,
        "list_user_favorite_exercise_ids",
        no_favorites,
    )

    try:
        response = client.get(
            "/api/v1/exercises",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 200

    data = response.json()

    assert len(data) == 101
    assert data[:100] == jsonable_encoder(
        [
            exercise.model_copy(update={"favorite": False})
            for exercise in load_exercises()
        ],
        exclude_none=True,
    )
    assert data[-1] == {
        "id": f"custom-{custom_uuid}",
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


def test_list_exercises_authenticated_marks_custom_favorite(monkeypatch):
    from app.domains.exercises import router as exercises_api
    from app.domains.exercises.models import Exercise

    custom_uuid = "11111111-2222-3333-4444-555555555555"

    async def fake_list_custom_exercise_models(user):
        return [
            Exercise(
                id=f"custom-{custom_uuid}",
                name="Press personalizado",
                muscle="Pecho",
                equipment="Mancuernas",
                type="Fuerza",
                favorite=False,
                custom=True,
                notes="Controlar la bajada.",
                category="strength",
                recordTypes=["weight", "reps"],
            )
        ]

    async def fake_list_user_favorite_exercise_ids(user):
        assert user.id == "user-123"
        return {f"custom-{custom_uuid}"}

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "list_custom_exercise_models",
        fake_list_custom_exercise_models,
    )
    monkeypatch.setattr(
        exercises_api,
        "list_user_favorite_exercise_ids",
        fake_list_user_favorite_exercise_ids,
    )

    try:
        response = client.get(
            "/api/v1/exercises",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 200
    assert response.json()[-1]["id"] == f"custom-{custom_uuid}"
    assert response.json()[-1]["favorite"] is True


def test_list_exercises_custom_supabase_failure_returns_builtin_catalog(monkeypatch):
    from app.domains.exercises import router as exercises_api

    async def fake_list_custom_exercise_models(user):
        raise httpx.ConnectError("connection failed")

    async def fake_list_user_favorite_exercise_ids(user):
        raise httpx.ConnectError("connection failed")

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "list_custom_exercise_models",
        fake_list_custom_exercise_models,
    )
    monkeypatch.setattr(
        exercises_api,
        "list_user_favorite_exercise_ids",
        fake_list_user_favorite_exercise_ids,
    )

    try:
        response = client.get(
            "/api/v1/exercises",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 200
    assert response.json() == jsonable_encoder(
        [
            exercise.model_copy(update={"favorite": False})
            for exercise in load_exercises()
        ],
        exclude_none=True,
    )


def test_get_exercise_by_id_requires_authentication():
    response = client.get("/api/v1/exercises/bench-press")

    assert response.status_code == 401
    assert response.json() == {"detail": "Missing bearer token"}


def test_get_builtin_exercise_by_id_authenticated(monkeypatch):
    from app.domains.exercises import router as exercises_api

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "list_user_favorite_exercise_ids",
        no_favorites,
    )

    try:
        response = client.get(
            "/api/v1/exercises/bench-press",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 200
    assert response.json() == {
        "id": "bench-press",
        "name": "Press de banca",
        "muscle": "Pecho",
        "equipment": "Barra",
        "type": "Fuerza",
        "favorite": False,
        "custom": False,
        "notes": "Escápulas retraídas y pies firmes.",
        "category": "strength",
    }


def test_get_custom_exercise_by_id_authenticated(monkeypatch):
    from app.domains.exercises import router as exercises_api
    from app.domains.exercises.models import Exercise

    custom_uuid = "11111111-2222-3333-4444-555555555555"

    async def fake_get_custom_exercise_model_by_id(user, exercise_id):
        assert user.id == "user-123"
        assert exercise_id == f"custom-{custom_uuid}"

        return Exercise(
            id=f"custom-{custom_uuid}",
            name="Press personalizado",
            muscle="Pecho",
            equipment="Mancuernas",
            type="Fuerza",
            favorite=False,
            custom=True,
            notes="Controlar la bajada.",
            category="strength",
            recordTypes=["weight", "reps"],
        )

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "get_custom_exercise_model_by_id",
        fake_get_custom_exercise_model_by_id,
    )
    monkeypatch.setattr(
        exercises_api,
        "list_user_favorite_exercise_ids",
        no_favorites,
    )
    monkeypatch.setattr(
        exercises_api,
        "list_user_favorite_exercise_ids",
        no_favorites,
    )
    monkeypatch.setattr(
        exercises_api,
        "list_user_favorite_exercise_ids",
        no_favorites,
    )

    try:
        response = client.get(
            f"/api/v1/exercises/custom-{custom_uuid}",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 200
    assert response.json() == {
        "id": f"custom-{custom_uuid}",
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


def test_get_missing_custom_exercise_returns_404(monkeypatch):
    from app.domains.exercises import router as exercises_api

    async def fake_get_custom_exercise_model_by_id(user, exercise_id):
        return None

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "get_custom_exercise_model_by_id",
        fake_get_custom_exercise_model_by_id,
    )
    monkeypatch.setattr(
        exercises_api,
        "list_user_favorite_exercise_ids",
        no_favorites,
    )

    try:
        response = client.get(
            "/api/v1/exercises/custom-11111111-2222-3333-4444-555555555555",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 404
    assert response.json() == {"detail": "Exercise not found"}


def test_get_other_user_custom_exercise_returns_same_404(monkeypatch):
    from app.domains.exercises import router as exercises_api

    async def fake_get_custom_exercise_model_by_id(user, exercise_id):
        return None

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "get_custom_exercise_model_by_id",
        fake_get_custom_exercise_model_by_id,
    )
    monkeypatch.setattr(
        exercises_api,
        "list_user_favorite_exercise_ids",
        no_favorites,
    )

    try:
        response = client.get(
            "/api/v1/exercises/custom-22222222-3333-4444-5555-666666666666",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 404
    assert response.json() == {"detail": "Exercise not found"}


def test_get_custom_exercise_invalid_uuid_returns_404_without_supabase(monkeypatch):
    from app.domains.exercises import custom_repository as custom_exercises_repository
    from app.domains.exercises import router as exercises_api

    class FakeClient:
        def __init__(self, timeout):
            raise AssertionError("Supabase should not be queried")

    monkeypatch.setattr(
        custom_exercises_repository.httpx,
        "AsyncClient",
        FakeClient,
    )

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "list_user_favorite_exercise_ids",
        no_favorites,
    )

    try:
        response = client.get(
            "/api/v1/exercises/custom-not-a-uuid",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 404
    assert response.json() == {"detail": "Exercise not found"}


def test_get_custom_exercise_supabase_failure_returns_controlled_error(monkeypatch):
    from app.domains.exercises import router as exercises_api

    async def fake_get_custom_exercise_model_by_id(user, exercise_id):
        raise httpx.HTTPStatusError(
            "server error",
            request=httpx.Request("GET", "https://example.supabase.co"),
            response=httpx.Response(500),
        )

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "get_custom_exercise_model_by_id",
        fake_get_custom_exercise_model_by_id,
    )

    try:
        response = client.get(
            "/api/v1/exercises/custom-11111111-2222-3333-4444-555555555555",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 502
    assert response.json() == {
        "detail": "Custom exercises service is unavailable"
    }


def test_unknown_exercise_returns_404(monkeypatch):
    from app.domains.exercises import router as exercises_api

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "list_user_favorite_exercise_ids",
        no_favorites,
    )

    try:
        response = client.get(
            "/api/v1/exercises/does-not-exist",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 404
    assert response.json() == {"detail": "Exercise not found"}


def test_patch_custom_exercise_updates_own_custom(monkeypatch):
    from app.domains.exercises import router as exercises_api
    from app.domains.exercises.models import Exercise

    captured = {}
    custom_uuid = "11111111-2222-3333-4444-555555555555"

    async def fake_update_custom_exercise_model(user, exercise_id, payload):
        captured["user_id"] = user.id
        captured["exercise_id"] = exercise_id
        captured["changes"] = payload.update_payload()

        return Exercise(
            id=f"custom-{custom_uuid}",
            name="Press editado",
            muscle="Pecho",
            equipment="Mancuernas",
            type="Fuerza",
            favorite=False,
            custom=True,
            notes="Controlar la bajada.",
            category="strength",
            recordTypes=["weight", "reps"],
        )

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "update_custom_exercise_model",
        fake_update_custom_exercise_model,
    )

    try:
        response = client.patch(
            f"/api/v1/exercises/custom-{custom_uuid}",
            headers={"Authorization": "Bearer token-123"},
            json={
                "name": "Press editado",
                "recordTypes": ["weight", "reps"],
            },
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 200
    assert captured == {
        "user_id": "user-123",
        "exercise_id": f"custom-{custom_uuid}",
        "changes": {
            "name": "Press editado",
            "recordTypes": ["weight", "reps"],
        },
    }
    assert response.json() == {
        "id": f"custom-{custom_uuid}",
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


def test_patch_builtin_exercise_returns_404(monkeypatch):
    from app.domains.exercises import router as exercises_api

    async def fake_update_custom_exercise_model(user, exercise_id, payload):
        raise AssertionError("Built-ins must not be patched through Supabase")

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "update_custom_exercise_model",
        fake_update_custom_exercise_model,
    )

    try:
        response = client.patch(
            "/api/v1/exercises/bench-press",
            headers={"Authorization": "Bearer token-123"},
            json={"name": "No tocar"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 404
    assert response.json() == {"detail": "Exercise not found"}


def test_patch_missing_custom_exercise_returns_404(monkeypatch):
    from app.domains.exercises import router as exercises_api

    async def fake_update_custom_exercise_model(user, exercise_id, payload):
        return None

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "update_custom_exercise_model",
        fake_update_custom_exercise_model,
    )

    try:
        response = client.patch(
            "/api/v1/exercises/custom-11111111-2222-3333-4444-555555555555",
            headers={"Authorization": "Bearer token-123"},
            json={"name": "Press editado"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 404
    assert response.json() == {"detail": "Exercise not found"}


def test_patch_other_user_custom_exercise_returns_same_404(monkeypatch):
    from app.domains.exercises import router as exercises_api

    async def fake_update_custom_exercise_model(user, exercise_id, payload):
        return None

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "update_custom_exercise_model",
        fake_update_custom_exercise_model,
    )

    try:
        response = client.patch(
            "/api/v1/exercises/custom-22222222-3333-4444-5555-666666666666",
            headers={"Authorization": "Bearer token-123"},
            json={"name": "Press editado"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 404
    assert response.json() == {"detail": "Exercise not found"}


def test_patch_invalid_custom_uuid_returns_404_without_supabase(monkeypatch):
    from app.domains.exercises import custom_repository as custom_exercises_repository

    class FakeClient:
        def __init__(self, timeout):
            raise AssertionError("Supabase should not be queried")

    monkeypatch.setattr(
        custom_exercises_repository.httpx,
        "AsyncClient",
        FakeClient,
    )

    app.dependency_overrides[require_user] = authenticated_user

    try:
        response = client.patch(
            "/api/v1/exercises/custom-not-a-uuid",
            headers={"Authorization": "Bearer token-123"},
            json={"name": "Press editado"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 404
    assert response.json() == {"detail": "Exercise not found"}


def test_patch_exercise_requires_authentication():
    response = client.patch(
        "/api/v1/exercises/custom-11111111-2222-3333-4444-555555555555",
        json={"name": "Press editado"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Missing bearer token"}


def test_patch_custom_exercise_supabase_failure_returns_controlled_error(monkeypatch):
    from app.domains.exercises import router as exercises_api

    async def fake_update_custom_exercise_model(user, exercise_id, payload):
        raise httpx.HTTPStatusError(
            "server error",
            request=httpx.Request("PATCH", "https://example.supabase.co"),
            response=httpx.Response(500),
        )

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "update_custom_exercise_model",
        fake_update_custom_exercise_model,
    )

    try:
        response = client.patch(
            "/api/v1/exercises/custom-11111111-2222-3333-4444-555555555555",
            headers={"Authorization": "Bearer token-123"},
            json={"name": "Press editado"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 502
    assert response.json() == {
        "detail": "Custom exercises service is unavailable"
    }


def test_patch_custom_exercise_rejects_protected_fields():
    app.dependency_overrides[require_user] = authenticated_user

    try:
        response = client.patch(
            "/api/v1/exercises/custom-11111111-2222-3333-4444-555555555555",
            headers={"Authorization": "Bearer token-123"},
            json={
                "id": "custom-22222222-3333-4444-5555-666666666666",
                "user_id": "other-user",
                "custom": False,
                "favorite": True,
            },
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 422


def test_patch_custom_exercise_rejects_empty_patch():
    app.dependency_overrides[require_user] = authenticated_user

    try:
        response = client.patch(
            "/api/v1/exercises/custom-11111111-2222-3333-4444-555555555555",
            headers={"Authorization": "Bearer token-123"},
            json={},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 422


def test_patch_custom_exercise_rejects_null_values():
    app.dependency_overrides[require_user] = authenticated_user

    try:
        response = client.patch(
            "/api/v1/exercises/custom-11111111-2222-3333-4444-555555555555",
            headers={"Authorization": "Bearer token-123"},
            json={"notes": None},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 422


def test_delete_custom_exercise_removes_own_custom(monkeypatch):
    from app.domains.exercises import router as exercises_api

    captured = {}
    custom_uuid = "11111111-2222-3333-4444-555555555555"

    async def fake_remove_custom_exercise(user, exercise_id):
        captured["user_id"] = user.id
        captured["exercise_id"] = exercise_id
        return True

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "remove_custom_exercise",
        fake_remove_custom_exercise,
    )

    try:
        response = client.delete(
            f"/api/v1/exercises/custom-{custom_uuid}",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 204
    assert response.content == b""
    assert captured == {
        "user_id": "user-123",
        "exercise_id": f"custom-{custom_uuid}",
    }


def test_delete_builtin_exercise_returns_404(monkeypatch):
    from app.domains.exercises import router as exercises_api

    async def fake_remove_custom_exercise(user, exercise_id):
        raise AssertionError("Built-ins must not be deleted through Supabase")

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "remove_custom_exercise",
        fake_remove_custom_exercise,
    )

    try:
        response = client.delete(
            "/api/v1/exercises/bench-press",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 404
    assert response.json() == {"detail": "Exercise not found"}


def test_delete_missing_custom_exercise_returns_404(monkeypatch):
    from app.domains.exercises import router as exercises_api

    async def fake_remove_custom_exercise(user, exercise_id):
        return False

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "remove_custom_exercise",
        fake_remove_custom_exercise,
    )

    try:
        response = client.delete(
            "/api/v1/exercises/custom-11111111-2222-3333-4444-555555555555",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 404
    assert response.json() == {"detail": "Exercise not found"}


def test_delete_other_user_custom_exercise_returns_same_404(monkeypatch):
    from app.domains.exercises import router as exercises_api

    async def fake_remove_custom_exercise(user, exercise_id):
        return False

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "remove_custom_exercise",
        fake_remove_custom_exercise,
    )

    try:
        response = client.delete(
            "/api/v1/exercises/custom-22222222-3333-4444-5555-666666666666",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 404
    assert response.json() == {"detail": "Exercise not found"}


def test_delete_invalid_custom_uuid_returns_404_without_supabase(monkeypatch):
    from app.domains.exercises import custom_repository as custom_exercises_repository

    class FakeClient:
        def __init__(self, timeout):
            raise AssertionError("Supabase should not be queried")

    monkeypatch.setattr(
        custom_exercises_repository.httpx,
        "AsyncClient",
        FakeClient,
    )

    app.dependency_overrides[require_user] = authenticated_user

    try:
        response = client.delete(
            "/api/v1/exercises/custom-not-a-uuid",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 404
    assert response.json() == {"detail": "Exercise not found"}


def test_delete_exercise_requires_authentication():
    response = client.delete(
        "/api/v1/exercises/custom-11111111-2222-3333-4444-555555555555",
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Missing bearer token"}


def test_delete_custom_exercise_supabase_failure_returns_controlled_error(monkeypatch):
    from app.domains.exercises import router as exercises_api

    async def fake_remove_custom_exercise(user, exercise_id):
        raise httpx.HTTPStatusError(
            "server error",
            request=httpx.Request("DELETE", "https://example.supabase.co"),
            response=httpx.Response(500),
        )

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "remove_custom_exercise",
        fake_remove_custom_exercise,
    )

    try:
        response = client.delete(
            "/api/v1/exercises/custom-11111111-2222-3333-4444-555555555555",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 502
    assert response.json() == {
        "detail": "Custom exercises service is unavailable"
    }


def test_put_builtin_favorite_succeeds(monkeypatch):
    from app.domains.exercises import router as exercises_api

    captured = {}

    async def fake_mark_exercise_favorite(user, exercise_id):
        captured["user_id"] = user.id
        captured["exercise_id"] = exercise_id

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "mark_exercise_favorite",
        fake_mark_exercise_favorite,
    )

    try:
        response = client.put(
            "/api/v1/exercises/bench-press/favorite",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 200
    assert response.json()["id"] == "bench-press"
    assert response.json()["favorite"] is True
    assert captured == {
        "user_id": "user-123",
        "exercise_id": "bench-press",
    }


def test_put_custom_favorite_succeeds(monkeypatch):
    from app.domains.exercises import router as exercises_api
    from app.domains.exercises.models import Exercise

    custom_uuid = "11111111-2222-3333-4444-555555555555"
    captured = {}

    async def fake_get_custom_exercise_model_by_id(user, exercise_id):
        assert user.id == "user-123"
        assert exercise_id == f"custom-{custom_uuid}"
        return Exercise(
            id=f"custom-{custom_uuid}",
            name="Press personalizado",
            muscle="Pecho",
            equipment="Mancuernas",
            type="Fuerza",
            favorite=False,
            custom=True,
            notes="Controlar la bajada.",
            category="strength",
            recordTypes=["weight", "reps"],
        )

    async def fake_mark_exercise_favorite(user, exercise_id):
        captured["user_id"] = user.id
        captured["exercise_id"] = exercise_id

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "get_custom_exercise_model_by_id",
        fake_get_custom_exercise_model_by_id,
    )
    monkeypatch.setattr(
        exercises_api,
        "mark_exercise_favorite",
        fake_mark_exercise_favorite,
    )

    try:
        response = client.put(
            f"/api/v1/exercises/custom-{custom_uuid}/favorite",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 200
    assert response.json()["id"] == f"custom-{custom_uuid}"
    assert response.json()["favorite"] is True
    assert captured == {
        "user_id": "user-123",
        "exercise_id": f"custom-{custom_uuid}",
    }


def test_put_custom_favorite_other_user_returns_404(monkeypatch):
    from app.domains.exercises import router as exercises_api

    async def fake_get_custom_exercise_model_by_id(user, exercise_id):
        return None

    async def fake_mark_exercise_favorite(user, exercise_id):
        raise AssertionError("Missing custom must not be favorited")

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "get_custom_exercise_model_by_id",
        fake_get_custom_exercise_model_by_id,
    )
    monkeypatch.setattr(
        exercises_api,
        "mark_exercise_favorite",
        fake_mark_exercise_favorite,
    )

    try:
        response = client.put(
            "/api/v1/exercises/custom-22222222-3333-4444-5555-666666666666/favorite",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 404
    assert response.json() == {"detail": "Exercise not found"}


def test_put_favorite_unknown_exercise_returns_404(monkeypatch):
    from app.domains.exercises import router as exercises_api

    async def fake_mark_exercise_favorite(user, exercise_id):
        raise AssertionError("Unknown exercise must not be favorited")

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "mark_exercise_favorite",
        fake_mark_exercise_favorite,
    )

    try:
        response = client.put(
            "/api/v1/exercises/does-not-exist/favorite",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 404
    assert response.json() == {"detail": "Exercise not found"}


def test_put_favorite_repeated_is_idempotent(monkeypatch):
    from app.domains.exercises import router as exercises_api

    calls = []

    async def fake_mark_exercise_favorite(user, exercise_id):
        calls.append((user.id, exercise_id))

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "mark_exercise_favorite",
        fake_mark_exercise_favorite,
    )

    try:
        first = client.put(
            "/api/v1/exercises/bench-press/favorite",
            headers={"Authorization": "Bearer token-123"},
        )
        second = client.put(
            "/api/v1/exercises/bench-press/favorite",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["favorite"] is True
    assert second.json()["favorite"] is True
    assert calls == [
        ("user-123", "bench-press"),
        ("user-123", "bench-press"),
    ]


def test_delete_favorite_succeeds(monkeypatch):
    from app.domains.exercises import router as exercises_api

    captured = {}

    async def fake_unmark_exercise_favorite(user, exercise_id):
        captured["user_id"] = user.id
        captured["exercise_id"] = exercise_id

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "unmark_exercise_favorite",
        fake_unmark_exercise_favorite,
    )

    try:
        response = client.delete(
            "/api/v1/exercises/bench-press/favorite",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 200
    assert response.json()["id"] == "bench-press"
    assert response.json()["favorite"] is False
    assert captured == {
        "user_id": "user-123",
        "exercise_id": "bench-press",
    }


def test_delete_favorite_repeated_is_idempotent(monkeypatch):
    from app.domains.exercises import router as exercises_api

    calls = []

    async def fake_unmark_exercise_favorite(user, exercise_id):
        calls.append((user.id, exercise_id))

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "unmark_exercise_favorite",
        fake_unmark_exercise_favorite,
    )

    try:
        first = client.delete(
            "/api/v1/exercises/bench-press/favorite",
            headers={"Authorization": "Bearer token-123"},
        )
        second = client.delete(
            "/api/v1/exercises/bench-press/favorite",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["favorite"] is False
    assert second.json()["favorite"] is False
    assert calls == [
        ("user-123", "bench-press"),
        ("user-123", "bench-press"),
    ]


def test_favorite_requires_authentication():
    response = client.put("/api/v1/exercises/bench-press/favorite")

    assert response.status_code == 401
    assert response.json() == {"detail": "Missing bearer token"}


def test_put_favorite_supabase_failure_returns_controlled_error(monkeypatch):
    from app.domains.exercises import router as exercises_api

    async def fake_mark_exercise_favorite(user, exercise_id):
        raise httpx.HTTPStatusError(
            "server error",
            request=httpx.Request("POST", "https://example.supabase.co"),
            response=httpx.Response(500),
        )

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        exercises_api,
        "mark_exercise_favorite",
        fake_mark_exercise_favorite,
    )

    try:
        response = client.put(
            "/api/v1/exercises/bench-press/favorite",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 502
    assert response.json() == {
        "detail": "Custom exercises service is unavailable"
    }


def test_versioned_health_route():
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "api": "v1",
    }


def test_resolve_exercise_by_valid_id_and_exact_name():
    response = client.post(
        "/api/v1/exercises/resolve",
        json={
            "exerciseId": "bench-press",
            "exerciseName": "Press de banca",
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["exercise"]["id"] == "bench-press"
    assert data["exercise"]["name"] == "Press de banca"
    assert "correction" not in data
    assert "errorCode" not in data


def test_resolve_exercise_by_valid_id_normalizes_different_name():
    response = client.post(
        "/api/v1/exercises/resolve",
        json={
            "exerciseId": "bench-press",
            "exerciseName": "Press banca inventado",
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["exercise"]["id"] == "bench-press"
    assert data["exercise"]["name"] == "Press de banca"
    assert data["correction"]["code"] == "exercise_name_normalized_from_id"
    assert data["correction"]["originalName"] == "Press banca inventado"
    assert data["correction"]["canonicalName"] == "Press de banca"
    assert data["correction"]["exerciseId"] == "bench-press"
    assert "errorCode" not in data


def test_resolve_exercise_by_valid_id_completes_empty_name():
    response = client.post(
        "/api/v1/exercises/resolve",
        json={
            "exerciseId": "bench-press",
            "exerciseName": "",
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["exercise"]["id"] == "bench-press"
    assert data["correction"]["originalName"] == ""
    assert data["correction"]["canonicalName"] == "Press de banca"


def test_resolve_unknown_exercise_id():
    response = client.post(
        "/api/v1/exercises/resolve",
        json={
            "exerciseId": "does-not-exist",
            "exerciseName": "Press de banca",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "errorCode": "unknown_exercise_id",
        "error": "El ID de ejercicio no existe en la biblioteca de GymOS.",
    }


def test_resolve_exercise_by_name_without_id():
    response = client.post(
        "/api/v1/exercises/resolve",
        json={
            "exerciseName": "Press de banca",
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["exercise"]["id"] == "bench-press"
    assert "correction" not in data
    assert "errorCode" not in data


def test_resolve_exercise_name_is_accent_insensitive():
    response = client.post(
        "/api/v1/exercises/resolve",
        json={
            "exerciseName": "Press de banca",
        },
    )

    assert response.status_code == 200
    assert response.json()["exercise"]["id"] == "bench-press"


def test_resolve_unknown_exercise_name():
    response = client.post(
        "/api/v1/exercises/resolve",
        json={
            "exerciseName": "Ejercicio completamente inexistente",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "errorCode": "unknown_exercise",
        "error": "No se reconoce el ejercicio. Utiliza un ID de la biblioteca o corrige el nombre.",
    }


def test_create_custom_exercise_requires_authentication():
    response = client.post(
        "/api/v1/exercises",
        json={
            "name": "Mi ejercicio",
            "muscle": "Pecho",
            "equipment": "Mancuernas",
            "type": "Fuerza",
            "notes": "",
            "category": "strength",
            "recordTypes": ["weight", "reps"],
        },
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Missing bearer token"}


def test_create_custom_exercise_returns_created_exercise(monkeypatch):
    from app.core.auth import AuthenticatedUser, require_user
    from app.domains.exercises import router as exercises_api

    async def fake_user():
        return AuthenticatedUser(
            id="user-123",
            email="test@example.com",
            access_token="token-123",
        )

    async def fake_register_custom_exercise(user, payload):
        assert user.id == "user-123"
        assert payload.name == "Press personalizado"
        assert payload.recordTypes == ["weight", "reps"]

        return {
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

    app.dependency_overrides[require_user] = fake_user
    monkeypatch.setattr(
        exercises_api,
        "register_custom_exercise",
        fake_register_custom_exercise,
    )

    try:
        response = client.post(
            "/api/v1/exercises",
            json={
                "name": "Press personalizado",
                "muscle": "Pecho",
                "equipment": "Mancuernas",
                "type": "Fuerza",
                "notes": "Controlar la bajada.",
                "category": "strength",
                "recordTypes": ["weight", "reps"],
            },
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 201
    assert response.json() == {
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
