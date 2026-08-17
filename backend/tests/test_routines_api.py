import httpx
from fastapi.testclient import TestClient

from auth import AuthenticatedUser, require_user
from app.models.routine import Routine
from main import app


client = TestClient(app)


async def authenticated_user():
    return AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="token-123",
    )


def routine_model(routine_id="routine-1"):
    return Routine(
        schemaVersion="4.2",
        routineId=routine_id,
        revision=1,
        name="Fuerza",
        sessions=[
            {
                "sessionId": "session-a",
                "order": 1,
                "label": "A",
                "name": "Sesión A",
                "focus": "Empuje",
                "estimatedDurationMinutes": 60,
                "exercises": [
                    {
                        "exerciseId": "bench-press",
                        "name": "Press de banca",
                        "sets": 3,
                        "target": "8-10 reps",
                    }
                ],
            }
        ],
    )


def test_list_routines_returns_user_routines(monkeypatch):
    from app.api.v1 import routines as routines_api

    async def fake_list_user_routines(user):
        assert user.id == "user-123"
        return [routine_model()]

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        routines_api,
        "list_user_routines",
        fake_list_user_routines,
    )

    try:
        response = client.get(
            "/api/v1/routines",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 200
    assert response.json() == [
        {
            "schemaVersion": "4.2",
            "routineId": "routine-1",
            "revision": 1,
            "name": "Fuerza",
            "sessions": [
                {
                    "sessionId": "session-a",
                    "order": 1,
                    "label": "A",
                    "name": "Sesión A",
                    "focus": "Empuje",
                    "estimatedDurationMinutes": 60,
                    "exercises": [
                        {
                            "exerciseId": "bench-press",
                            "name": "Press de banca",
                            "sets": 3,
                            "target": "8-10 reps",
                        }
                    ],
                }
            ],
        }
    ]


def test_list_routines_without_routines_returns_empty_list(monkeypatch):
    from app.api.v1 import routines as routines_api

    async def fake_list_user_routines(user):
        return []

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        routines_api,
        "list_user_routines",
        fake_list_user_routines,
    )

    try:
        response = client.get(
            "/api/v1/routines",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 200
    assert response.json() == []


def test_get_routine_returns_user_routine(monkeypatch):
    from app.api.v1 import routines as routines_api

    async def fake_get_user_routine_by_id(user, routine_id):
        assert user.id == "user-123"
        assert routine_id == "routine-1"
        return routine_model()

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        routines_api,
        "get_user_routine_by_id",
        fake_get_user_routine_by_id,
    )

    try:
        response = client.get(
            "/api/v1/routines/routine-1",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 200
    assert response.json()["routineId"] == "routine-1"


def test_get_foreign_routine_returns_404(monkeypatch):
    from app.api.v1 import routines as routines_api

    async def fake_get_user_routine_by_id(user, routine_id):
        return None

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        routines_api,
        "get_user_routine_by_id",
        fake_get_user_routine_by_id,
    )

    try:
        response = client.get(
            "/api/v1/routines/routine-foreign",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 404
    assert response.json() == {"detail": "Routine not found"}


def test_get_missing_routine_returns_same_404(monkeypatch):
    from app.api.v1 import routines as routines_api

    async def fake_get_user_routine_by_id(user, routine_id):
        return None

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        routines_api,
        "get_user_routine_by_id",
        fake_get_user_routine_by_id,
    )

    try:
        response = client.get(
            "/api/v1/routines/does-not-exist",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 404
    assert response.json() == {"detail": "Routine not found"}


def test_list_routines_requires_authentication():
    response = client.get("/api/v1/routines")

    assert response.status_code == 401
    assert response.json() == {"detail": "Missing bearer token"}


def test_routines_supabase_error_returns_502(monkeypatch):
    from app.api.v1 import routines as routines_api

    async def fake_list_user_routines(user):
        raise httpx.ConnectError("connection failed")

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        routines_api,
        "list_user_routines",
        fake_list_user_routines,
    )

    try:
        response = client.get(
            "/api/v1/routines",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 502
    assert response.json() == {"detail": "Routines service is unavailable"}
