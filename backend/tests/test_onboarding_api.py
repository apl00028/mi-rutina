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


def profile_payload():
    return {
        "display_name": "Adrian",
        "age": 35,
        "sex": "male",
        "height_cm": 178,
        "weight_kg": 78,
        "motivations": [
            "strength",
        ],
        "primary_goal": "strength_gain",
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
            "lat_pulldown",
            "seated_row",
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
        "injuries": [],
        "pain_areas": [],
        "avoided_exercise_ids": [],
        "preferred_exercise_ids": [],
    }


def usable_routine():
    return Routine(
        routineId="routine-onboarding-1",
        schemaVersion="4.2",
        revision=1,
        sessions=[
            {
                "sessionId": "session-1",
                "order": 1,
                "label": "Sesión 1",
                "name": "Sesión 1",
                "focus": "upper",
                "estimatedDurationMinutes": 60,
                "exercises": [
                    {
                        "exerciseId": (
                            "dumbbell-bench-press"
                        ),
                        "id": (
                            "dumbbell-bench-press"
                        ),
                        "name": (
                            "Press banca "
                            "con mancuernas"
                        ),
                        "order": 1,
                        "sets": 3,
                        "target": "4-6",
                        "recordType": "weight_reps",
                        "restSeconds": 180,
                    }
                ],
            }
        ],
    )


def test_complete_onboarding_persists_usable_routine_once(monkeypatch):
    from app.api.v1 import onboarding as onboarding_api

    persisted = []

    async def fake_persist(user, profile, routine):
        assert user.id == "user-123"
        assert profile.primary_goal == "strength_gain"
        persisted.append(routine)

    app.dependency_overrides[
        require_user
    ] = authenticated_user
    monkeypatch.setattr(
        onboarding_api,
        "_persist_onboarding",
        fake_persist,
    )

    try:
        response = client.post(
            "/api/v1/onboarding/complete",
            json={
                "profile":
                    profile_payload()
            },
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
        data["onboarding_completed"]
        is True
    )
    assert len(persisted) == 1
    assert persisted[0].sessions
    assert all(
        session["exercises"]
        for session in persisted[0].sessions
    )


def test_complete_onboarding_rejects_empty_generated_sessions(monkeypatch):
    from app.api.v1 import onboarding as onboarding_api

    async def fake_persist(user, profile, routine):
        raise AssertionError(
            "empty routine must not persist"
        )

    def fake_canonical_routine(profile):
        return Routine(
            routineId="routine-empty",
            schemaVersion="4.2",
            revision=1,
            sessions=[
                {
                    "sessionId": "session-1",
                    "exercises": [],
                }
            ],
        )

    app.dependency_overrides[
        require_user
    ] = authenticated_user
    monkeypatch.setattr(
        onboarding_api,
        "_canonical_routine",
        fake_canonical_routine,
    )
    monkeypatch.setattr(
        onboarding_api,
        "_persist_onboarding",
        fake_persist,
    )

    try:
        response = client.post(
            "/api/v1/onboarding/complete",
            json={
                "profile":
                    profile_payload()
            },
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

    assert response.status_code == 422
    assert response.json() == {
        "detail": (
            "Could not generate "
            "a usable routine"
        )
    }


def test_complete_onboarding_rejects_malformed_exercise(monkeypatch):
    from app.api.v1 import onboarding as onboarding_api

    async def fake_persist(user, profile, routine):
        raise AssertionError(
            "malformed routine must not persist"
        )

    routine = usable_routine()
    routine.sessions[0]["exercises"][0][
        "exerciseId"
    ] = ""

    def fake_canonical_routine(profile):
        return routine

    app.dependency_overrides[
        require_user
    ] = authenticated_user
    monkeypatch.setattr(
        onboarding_api,
        "_canonical_routine",
        fake_canonical_routine,
    )
    monkeypatch.setattr(
        onboarding_api,
        "_persist_onboarding",
        fake_persist,
    )

    try:
        response = client.post(
            "/api/v1/onboarding/complete",
            json={
                "profile":
                    profile_payload()
            },
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

    assert response.status_code == 422
