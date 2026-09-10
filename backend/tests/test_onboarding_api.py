import asyncio

import httpx

from app.core.auth import AuthenticatedUser, require_user
from app.domains.goals.models import Goal
from main import app


USER_ID = "22222222-2222-4222-8222-222222222222"
GOAL_ID = "11111111-1111-4111-8111-111111111111"


def goal(**overrides) -> Goal:
    return Goal.model_validate({
        "id": GOAL_ID,
        "user_id": USER_ID,
        "category": "strength",
        "kind": "strength_gain",
        "variant": None,
        "target_date": None,
        "status": "active",
        "created_by_user_id": USER_ID,
        "created_at": "2026-09-10T08:00:00Z",
        "updated_at": "2026-09-10T08:00:00Z",
        **overrides,
    })


def request(
    monkeypatch,
    *,
    body=None,
    active_goal=True,
    role="user",
):
    from app.domains.onboarding import router as onboarding_api

    async def actor():
        return AuthenticatedUser(
            id=USER_ID,
            email="test@example.com",
            access_token="token-123",
            role=role,
        )

    async def active(*args):
        return goal() if active_goal else None

    app.dependency_overrides[require_user] = actor
    monkeypatch.setattr(
        onboarding_api.goal_service,
        "get_user_active_goal",
        active,
    )

    async def send():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            return await client.post(
                "/api/v1/onboarding/complete",
                json=body if body is not None else {
                    "goal_id": GOAL_ID,
                    "profile": {
                        "experience_level": "intermediate"
                    },
                },
                headers={"Authorization": "Bearer token-123"},
            )

    try:
        return asyncio.run(send())
    finally:
        app.dependency_overrides.pop(require_user, None)


def test_goal_is_required_before_completion(monkeypatch):
    from app.domains.onboarding import router as onboarding_api

    persisted = False

    async def persist(*args):
        nonlocal persisted
        persisted = True

    monkeypatch.setattr(
        onboarding_api,
        "_persist_onboarding_profile",
        persist,
    )
    response = request(monkeypatch, active_goal=False)
    assert response.status_code == 409
    assert response.json() == {"detail": "An active Goal is required"}
    assert persisted is False


def test_completion_persists_short_profile_without_routine(monkeypatch):
    from app.domains.onboarding import router as onboarding_api

    persisted = []

    async def persist(user, profile, active_goal):
        persisted.append((user, profile, active_goal))

    monkeypatch.setattr(
        onboarding_api,
        "_persist_onboarding_profile",
        persist,
    )
    response = request(monkeypatch)
    assert response.status_code == 200
    assert response.json() == {
        "onboarding_completed": True,
        "routine": None,
    }
    assert persisted[0][1].experience_level == "intermediate"
    assert persisted[0][2].id == goal().id


def test_completion_never_calls_routine_generation(monkeypatch):
    from app.domains.onboarding import router as onboarding_api
    from app.domains.routines import generator

    async def persist(*args):
        pass

    def generate(*args):
        raise AssertionError("onboarding must not generate a routine")

    monkeypatch.setattr(
        onboarding_api,
        "_persist_onboarding_profile",
        persist,
    )
    monkeypatch.setattr(generator, "generate_routine", generate)
    assert request(monkeypatch).status_code == 200


def test_legacy_profile_shape_remains_accepted(monkeypatch):
    from app.domains.onboarding import router as onboarding_api

    profiles = []

    async def persist(user, profile, active_goal):
        profiles.append(profile)

    monkeypatch.setattr(
        onboarding_api,
        "_persist_onboarding_profile",
        persist,
    )
    response = request(monkeypatch, body={
        "profile": {
            "display_name": "Adrián",
            "age": 35,
            "sex": "male",
            "height_cm": 178,
            "weight_kg": 78,
            "motivations": ["strength"],
            "primary_goal": "maintenance",
            "experience_level": "intermediate",
            "weekly_availability": 4,
            "session_duration_min": 60,
            "training_location": "commercial_gym",
            "available_equipment": ["barbell"],
            "injuries": [],
            "pain_areas": [],
            "avoided_exercise_ids": [],
            "preferred_exercise_ids": [],
        }
    })
    assert response.status_code == 200
    assert profiles[0].display_name == "Adrián"


def test_invalid_optional_profile_data_is_rejected(monkeypatch):
    response = request(monkeypatch, body={
        "goal_id": GOAL_ID,
        "profile": {"weekly_availability": 1},
    })
    assert response.status_code == 422


def test_retry_is_idempotent_at_completion_boundary(monkeypatch):
    from app.domains.onboarding import router as onboarding_api

    persisted = 0

    async def persist(*args):
        nonlocal persisted
        persisted += 1

    monkeypatch.setattr(
        onboarding_api,
        "_persist_onboarding_profile",
        persist,
    )
    assert request(monkeypatch).status_code == 200
    assert request(monkeypatch).status_code == 200
    assert persisted == 2


def test_trainer_cannot_complete_athlete_onboarding(monkeypatch):
    from app.domains.onboarding import router as onboarding_api

    persisted = False

    async def persist(*args):
        nonlocal persisted
        persisted = True

    monkeypatch.setattr(
        onboarding_api,
        "_persist_onboarding_profile",
        persist,
    )
    response = request(monkeypatch, role="trainer")
    assert response.status_code == 403
    assert persisted is False


def test_goal_id_must_match_active_owned_goal(monkeypatch):
    response = request(monkeypatch, body={
        "goal_id": "33333333-3333-4333-8333-333333333333",
        "profile": {},
    })
    assert response.status_code == 409


def test_profile_upsert_uses_goal_mapping_and_preserves_unset_fields(
    monkeypatch,
):
    from app.domains.onboarding import router as onboarding_api

    calls = []

    class Response:
        status_code = 204

    class SupabaseClient:
        async def post(self, url, **kwargs):
            calls.append((url, kwargs))
            return Response()

    monkeypatch.setattr(
        onboarding_api,
        "_supabase_config",
        lambda: ("https://example.supabase.co", "key"),
    )
    monkeypatch.setattr(
        onboarding_api,
        "get_supabase_http_client",
        lambda: SupabaseClient(),
    )
    profile = onboarding_api.OnboardingProfileInput(
        experience_level="intermediate",
        primary_goal="maintenance",
    )
    asyncio.run(onboarding_api._persist_onboarding_profile(
        AuthenticatedUser(
            id=USER_ID,
            access_token="token-123",
            role="user",
        ),
        profile,
        goal(),
    ))
    payload = calls[0][1]["json"]
    assert payload["onboarding_completed"] is True
    assert payload["primary_goal"] == "strength_gain"
    assert payload["experience_level"] == "intermediate"
    assert "weight_kg" not in payload
    assert "motivations" not in payload
    assert "/routines" not in calls[0][0]


def test_persistence_failure_does_not_report_completion(monkeypatch):
    from app.domains.onboarding import router as onboarding_api

    async def persist(*args):
        raise onboarding_api.HTTPException(
            status_code=502,
            detail="Could not complete Aptus onboarding",
        )

    monkeypatch.setattr(
        onboarding_api,
        "_persist_onboarding_profile",
        persist,
    )
    response = request(monkeypatch)
    assert response.status_code == 502
    assert response.json()["detail"] == "Could not complete Aptus onboarding"
