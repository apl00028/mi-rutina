import httpx
from fastapi.testclient import TestClient

from app.core.auth import AuthenticatedUser, require_user
from app.domains.routines.models import Routine
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


def routine_payload(routine_id="routine-1", revision=1):
    return {
        "schemaVersion": "4.2",
        "routineId": routine_id,
        "revision": revision,
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


def swimming_routine_model(routine_id="swim-1"):
    return Routine(
        schemaVersion="4.2",
        routineId=routine_id,
        revision=1,
        discipline="swimming",
        sessions=[
            {
                "sessionId": "swim-a",
                "poolLengthMeters": 25,
                "blocks": [
                    {
                        "sets": [
                            {
                                "repetitions": 4,
                                "distanceMeters": 100,
                                "restSeconds": 30,
                                "stroke": "freestyle",
                                "workType": "swim",
                                "intensity": "controlled",
                            }
                        ]
                    }
                ],
            }
        ],
    )


def test_list_routines_returns_user_routines(monkeypatch):
    from app.domains.routines import router as routines_api

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
    from app.domains.routines import router as routines_api

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
    from app.domains.routines import router as routines_api

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
    from app.domains.routines import router as routines_api

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
    from app.domains.routines import router as routines_api

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
    from app.domains.routines import router as routines_api

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


def test_create_routine_returns_201(monkeypatch):
    from app.domains.routines import router as routines_api

    captured = {}

    async def fake_create_user_routine(user, routine):
        captured["user_id"] = user.id
        captured["routine_id"] = routine.routineId
        return routine

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        routines_api,
        "create_user_routine",
        fake_create_user_routine,
    )

    try:
        response = client.post(
            "/api/v1/routines",
            headers={"Authorization": "Bearer token-123"},
            json=routine_payload(),
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 201
    assert response.json() == routine_payload()
    assert captured == {
        "user_id": "user-123",
        "routine_id": "routine-1",
    }


def test_create_routine_rejects_duplicate_with_409(monkeypatch):
    from app.domains.routines import router as routines_api

    async def fake_create_user_routine(user, routine):
        raise httpx.HTTPStatusError(
            "conflict",
            request=httpx.Request("POST", "https://example.supabase.co"),
            response=httpx.Response(409),
        )

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        routines_api,
        "create_user_routine",
        fake_create_user_routine,
    )

    try:
        response = client.post(
            "/api/v1/routines",
            headers={"Authorization": "Bearer token-123"},
            json=routine_payload(),
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 409
    assert response.json() == {"detail": "Routine already exists"}


def test_create_routine_requires_authentication():
    response = client.post("/api/v1/routines", json=routine_payload())

    assert response.status_code == 401
    assert response.json() == {"detail": "Missing bearer token"}


def test_create_routine_supabase_error_returns_502(monkeypatch):
    from app.domains.routines import router as routines_api

    async def fake_create_user_routine(user, routine):
        raise httpx.ConnectError("connection failed")

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        routines_api,
        "create_user_routine",
        fake_create_user_routine,
    )

    try:
        response = client.post(
            "/api/v1/routines",
            headers={"Authorization": "Bearer token-123"},
            json=routine_payload(),
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 502
    assert response.json() == {"detail": "Routines service is unavailable"}


def test_replace_routine_returns_200(monkeypatch):
    from app.domains.routines import router as routines_api

    captured = {}

    async def fake_replace_user_routine(user, routine_id, routine):
        captured["user_id"] = user.id
        captured["routine_id"] = routine_id
        captured["revision"] = routine.revision
        return routine

    payload = routine_payload(revision=2)

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        routines_api,
        "replace_user_routine",
        fake_replace_user_routine,
    )

    try:
        response = client.put(
            "/api/v1/routines/routine-1",
            headers={"Authorization": "Bearer token-123"},
            json=payload,
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 200
    assert response.json() == payload
    assert captured == {
        "user_id": "user-123",
        "routine_id": "routine-1",
        "revision": 2,
    }


def test_replace_routine_rejects_url_body_mismatch(monkeypatch):
    from app.domains.routines import router as routines_api

    async def fake_replace_user_routine(user, routine_id, routine):
        raise AssertionError("Mismatched IDs must not reach service")

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        routines_api,
        "replace_user_routine",
        fake_replace_user_routine,
    )

    try:
        response = client.put(
            "/api/v1/routines/routine-url",
            headers={"Authorization": "Bearer token-123"},
            json=routine_payload("routine-body"),
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 422
    assert response.json() == {"detail": "routine_id must match routineId"}


def test_replace_missing_routine_returns_404(monkeypatch):
    from app.domains.routines import router as routines_api

    async def fake_replace_user_routine(user, routine_id, routine):
        return None

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        routines_api,
        "replace_user_routine",
        fake_replace_user_routine,
    )

    try:
        response = client.put(
            "/api/v1/routines/routine-1",
            headers={"Authorization": "Bearer token-123"},
            json=routine_payload(),
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 404
    assert response.json() == {"detail": "Routine not found"}


def test_replace_foreign_routine_returns_same_404(monkeypatch):
    from app.domains.routines import router as routines_api

    async def fake_replace_user_routine(user, routine_id, routine):
        return None

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        routines_api,
        "replace_user_routine",
        fake_replace_user_routine,
    )

    try:
        response = client.put(
            "/api/v1/routines/routine-foreign",
            headers={"Authorization": "Bearer token-123"},
            json=routine_payload("routine-foreign"),
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 404
    assert response.json() == {"detail": "Routine not found"}


def test_delete_foreign_routine_returns_same_404(monkeypatch):
    from app.domains.routines import router as routines_api

    async def fake_delete_user_routine(user, routine_id):
        assert user.id == "user-123"
        assert routine_id == "routine-foreign"
        return False

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        routines_api,
        "delete_user_routine",
        fake_delete_user_routine,
    )

    try:
        response = client.delete(
            "/api/v1/routines/routine-foreign",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 404
    assert response.json() == {"detail": "Routine not found"}


def test_create_routine_rejects_invalid_body():
    app.dependency_overrides[require_user] = authenticated_user

    try:
        response = client.post(
            "/api/v1/routines",
            headers={"Authorization": "Bearer token-123"},
            json={
                "schemaVersion": "4.2",
                "routineId": "",
                "revision": 1,
                "sessions": [{"exercises": {}}],
            },
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == 422

def test_generate_routine_returns_proposal():
    app.dependency_overrides[
        require_user
    ] = authenticated_user

    payload = {
        "profile": {
            "primary_goal": "muscle_gain",
            "experience_level": "intermediate",
            "weekly_availability": 4,
            "session_duration_min": 60,
            "training_location": "commercial_gym",
            "available_equipment": [
                "barbell",
                "plates",
                "bench",
                "squat_rack",
                "dumbbells",
                "cable_machine",
                "lat_pulldown_machine",
                "seated_row_machine",
                "chest_press_machine",
                "shoulder_press_machine",
                "leg_press",
                "leg_extension",
                "seated_leg_curl",
                "lying_leg_curl",
                "calf_raise_machine",
                "mat",
                "bodyweight",
            ],
        }
    }

    try:
        response = client.post(
            "/api/v1/routines/generate",
            json=payload,
            headers={
                "Authorization":
                "Bearer token-123"
            },
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 200

    data = response.json()

    assert (
        data["structure_id"]
        == "upper_lower_four"
    )
    assert data["structure_label"] == (
        "Torso / Pierna"
    )

    assert len(data["sessions"]) == 4

    assert [
        session["focus"]
        for session in data["sessions"]
    ] == [
        "upper",
        "lower",
        "upper",
        "lower",
    ]

    exercises = [
        exercise
        for session in data["sessions"]
        for exercise in session["exercises"]
    ]

    assert exercises

    plank = next(
        exercise
        for exercise in exercises
        if exercise["exercise_id"]
        == "plank"
    )

    assert plank["record_type"] == "duration"
    assert "s" in plank["target"]
    assert "target_rir" not in plank


def test_generate_routine_requires_authentication():
    response = client.post(
        "/api/v1/routines/generate",
        json={
            "profile": {
                "primary_goal": "muscle_gain",
                "experience_level": (
                    "intermediate"
                ),
                "weekly_availability": 4,
                "session_duration_min": 60,
                "training_location": (
                    "commercial_gym"
                ),
                "available_equipment": [],
            }
        },
    )

    assert response.status_code == 401
    assert response.json() == {
        "detail": "Missing bearer token"
    }


def test_get_active_routine_accepts_discipline(monkeypatch):
    from app.domains.routines import router as routines_api

    captured = {}

    async def fake_get_user_active_routine(
        user,
        discipline,
    ):
        captured["user_id"] = user.id
        captured["discipline"] = discipline

        return swimming_routine_model()

    app.dependency_overrides[require_user] = authenticated_user
    monkeypatch.setattr(
        routines_api,
        "get_user_active_routine",
        fake_get_user_active_routine,
    )

    try:
        response = client.get(
            "/api/v1/routines/active",
            params={
                "discipline": "swimming",
            },
            headers={
                "Authorization": "Bearer token-123",
            },
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 200
    assert response.json()["routineId"] == "swim-1"
    assert response.json()["discipline"] == "swimming"
    assert captured == {
        "user_id": "user-123",
        "discipline": "swimming",
    }
