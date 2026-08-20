from fastapi.testclient import TestClient

from auth import AuthenticatedUser, require_user
from app.models.workout import Workout
from main import app


client = TestClient(app)


async def authenticated_user():
    return AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="token-123",
    )


def workout_model(workout_id="workout-1"):
    return Workout(
        workoutId=workout_id,
        routineId="routine-1",
        sessionId="session-a",
        status="in_progress",
        sets=[],
    )


def workout_payload(workout_id="workout-1"):
    return {
        "workoutId": workout_id,
        "routineId": "routine-1",
        "sessionId": "session-a",
        "status": "in_progress",
        "sets": [],
    }


def test_workouts_require_authentication():
    response = client.get(
        "/api/v1/workouts"
    )

    assert response.status_code == 401
    assert response.json() == {
        "detail": "Missing bearer token"
    }


def test_user_can_read_own_workout(monkeypatch):
    from app.api.v1 import workouts as workouts_api

    async def fake_get_user_workout_by_id(
        user,
        workout_id,
    ):
        assert user.id == "user-123"
        assert workout_id == "workout-1"
        return workout_model()

    app.dependency_overrides[
        require_user
    ] = authenticated_user
    monkeypatch.setattr(
        workouts_api,
        "get_user_workout_by_id",
        fake_get_user_workout_by_id,
    )

    try:
        response = client.get(
            "/api/v1/workouts/workout-1",
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
    assert response.json()["workoutId"] == "workout-1"


def test_foreign_workout_read_returns_404(monkeypatch):
    from app.api.v1 import workouts as workouts_api

    async def fake_get_user_workout_by_id(
        user,
        workout_id,
    ):
        assert user.id == "user-123"
        assert workout_id == "workout-foreign"
        return None

    app.dependency_overrides[
        require_user
    ] = authenticated_user
    monkeypatch.setattr(
        workouts_api,
        "get_user_workout_by_id",
        fake_get_user_workout_by_id,
    )

    try:
        response = client.get(
            "/api/v1/workouts/workout-foreign",
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

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Workout not found"
    }


def test_foreign_workout_update_returns_404(monkeypatch):
    from app.api.v1 import workouts as workouts_api

    async def fake_replace_user_workout(
        user,
        workout_id,
        workout,
    ):
        assert user.id == "user-123"
        assert workout_id == "workout-foreign"
        assert workout.workoutId == "workout-foreign"
        return None

    app.dependency_overrides[
        require_user
    ] = authenticated_user
    monkeypatch.setattr(
        workouts_api,
        "replace_user_workout",
        fake_replace_user_workout,
    )

    try:
        response = client.put(
            "/api/v1/workouts/workout-foreign",
            headers={
                "Authorization":
                    "Bearer token-123"
            },
            json=workout_payload(
                "workout-foreign"
            ),
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Workout not found"
    }


def test_foreign_workout_delete_returns_404(monkeypatch):
    from app.api.v1 import workouts as workouts_api

    async def fake_delete_user_workout(
        user,
        workout_id,
    ):
        assert user.id == "user-123"
        assert workout_id == "workout-foreign"
        return False

    app.dependency_overrides[
        require_user
    ] = authenticated_user
    monkeypatch.setattr(
        workouts_api,
        "delete_user_workout",
        fake_delete_user_workout,
    )

    try:
        response = client.delete(
            "/api/v1/workouts/workout-foreign",
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

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Workout not found"
    }
