from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def test_list_exercises_returns_100_items():
    response = client.get("/api/v1/exercises")

    assert response.status_code == 200

    data = response.json()

    assert len(data) == 100
    assert len({exercise["id"] for exercise in data}) == 100


def test_get_exercise_by_id():
    response = client.get("/api/v1/exercises/bench-press")

    assert response.status_code == 200
    assert response.json() == {
        "id": "bench-press",
        "name": "Press de banca",
        "muscle": "Pecho",
        "equipment": "Barra",
        "type": "Fuerza",
        "favorite": True,
        "custom": False,
        "notes": "Escápulas retraídas y pies firmes.",
        "category": "strength",
    }


def test_unknown_exercise_returns_404():
    response = client.get("/api/v1/exercises/does-not-exist")

    assert response.status_code == 404
    assert response.json() == {"detail": "Exercise not found"}


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
    from auth import AuthenticatedUser, require_user
    from app.api.v1 import exercises as exercises_api

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
