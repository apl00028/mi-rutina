import asyncio

from fastapi import HTTPException
from fastapi.testclient import TestClient
import httpx
import pytest

from app.core.auth import AuthenticatedUser, require_user
from main import app


client = TestClient(app)


async def normal_user():
    return AuthenticatedUser(
        id="user-123",
        email="user@example.com",
        access_token="token-123",
        role="user",
    )


async def trainer_user():
    return AuthenticatedUser(
        id="trainer-123",
        email="trainer@example.com",
        access_token="token-123",
        role="trainer",
    )


async def admin_user():
    return AuthenticatedUser(
        id="admin-123",
        email="admin@example.com",
        access_token="token-123",
        role="admin",
    )


def test_trainer_athletes_requires_authentication():
    response = client.get(
        "/api/v1/trainer/athletes"
    )

    assert response.status_code == 401
    assert response.json() == {
        "detail": "Missing bearer token"
    }


def test_normal_user_cannot_list_trainer_athletes():
    app.dependency_overrides[
        require_user
    ] = normal_user

    try:
        response = client.get(
            "/api/v1/trainer/athletes",
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

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Trainer access required"
    }


def test_admin_cannot_list_trainer_athletes():
    app.dependency_overrides[
        require_user
    ] = admin_user

    try:
        response = client.get(
            "/api/v1/trainer/athletes",
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

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Trainer access required"
    }


def test_trainer_can_list_active_athlete_relationships(monkeypatch):
    from app.domains.trainer import router as trainer_api

    async def fake_list(trainer):
        assert trainer.id == "trainer-123"
        return [
            {
                "athlete_id": "athlete-1",
                "status": "active",
                "email": "athlete@example.com",
                "display_name": "Athlete One",
                "client_since": "2026-08-15T10:00:00Z",
            }
        ]

    app.dependency_overrides[
        require_user
    ] = trainer_user
    monkeypatch.setattr(
        trainer_api,
        "list_authenticated_trainer_athletes",
        fake_list,
    )

    try:
        response = client.get(
            "/api/v1/trainer/athletes",
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
    assert response.json() == [
        {
            "athlete_id": "athlete-1",
            "status": "active",
            "email": "athlete@example.com",
            "display_name": "Athlete One",
            "client_since": "2026-08-15T10:00:00Z",
        }
    ]


def test_trainer_can_list_athlete_identity_nulls(monkeypatch):
    from app.domains.trainer import router as trainer_api

    async def fake_list(trainer):
        assert trainer.id == "trainer-123"
        return [
            {
                "athlete_id": "athlete-1",
                "status": "active",
                "email": None,
                "display_name": None,
                "client_since": "2026-08-15T10:00:00Z",
            }
        ]

    app.dependency_overrides[
        require_user
    ] = trainer_user
    monkeypatch.setattr(
        trainer_api,
        "list_authenticated_trainer_athletes",
        fake_list,
    )

    try:
        response = client.get(
            "/api/v1/trainer/athletes",
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
    assert response.json() == [
        {
            "athlete_id": "athlete-1",
            "status": "active",
            "email": None,
            "display_name": None,
            "client_since": "2026-08-15T10:00:00Z",
        }
    ]


def test_trainer_athletes_keeps_upstream_error_generic(monkeypatch):
    from app.domains.trainer import router as trainer_api

    request = httpx.Request(
        "POST",
        (
            "https://example.supabase.co/rest/v1/rpc/"
            "trainer_list_athlete_identities"
        ),
    )
    response = httpx.Response(
        400,
        request=request,
        content=(
            "authorization bearer-secret "
            "apikey publishable-secret "
            "database detail"
        ).encode(),
    )

    async def fake_list(_trainer):
        raise httpx.HTTPStatusError(
            "Bad Request",
            request=request,
            response=response,
        )

    monkeypatch.setattr(
        trainer_api,
        "list_authenticated_trainer_athletes",
        fake_list,
    )

    trainer = asyncio.run(
        trainer_user()
    )

    try:
        asyncio.run(
            trainer_api.list_trainer_athletes(
                trainer=trainer
            )
        )
    except HTTPException as exc:
        assert exc.status_code == 502
        assert exc.detail == (
            "Could not load trainer athletes"
        )
        assert "bearer-secret" not in exc.detail
        assert "publishable-secret" not in exc.detail
        assert "database detail" not in exc.detail
    else:
        raise AssertionError(
            "Expected HTTPException"
        )


def test_trainer_can_get_athlete_overview(monkeypatch):
    from app.domains.trainer import router as trainer_api
    from app.domains.trainer.models import TrainerAthleteOverview

    async def fake_get(trainer, athlete_id):
        assert trainer.id == "trainer-123"
        assert athlete_id == "athlete-1"
        return TrainerAthleteOverview.model_validate(
            {
                "athlete_id": "athlete-1",
                "status": "active",
                "email": "athlete@example.com",
                "display_name": "Athlete One",
                "client_since": "2026-08-15T10:00:00Z",
                "health": {
                    "weight_measurement_date": "2026-09-01",
                    "waist_measurement_date": "2026-08-30",
                    "weight_kg": 81.4,
                    "body_fat_percent": 18.2,
                    "muscle_mass_kg": 62.1,
                    "body_water_percent": 55.3,
                    "visceral_fat_index": 7,
                    "waist_cm": 83.5,
                },
                "recent_training": {
                    "last_completed": {
                        "workout_id": "workout-1",
                        "routine_id": "routine-strength",
                        "session_id": "push",
                        "session_name": "Empuje",
                        "finished_at": "2026-09-02T09:30:00Z",
                    },
                    "completed_last_7_days": 3,
                },
                "active_routines": {
                    "strength": {
                        "routine_id": "routine-strength",
                        "name": "Plan fuerza",
                        "activated_at": "2026-08-20T10:00:00Z",
                    },
                    "swimming": None,
                    "running": None,
                    "cycling": None,
                },
                "trainer": {
                    "last_assignment": {
                        "template_id": "template-1",
                        "routine_id": "assigned-routine",
                        "name": "Base fuerza",
                        "discipline": "strength",
                        "assigned_at": "2026-09-01T12:00:00Z",
                    }
                },
            }
        )

    monkeypatch.setattr(
        trainer_api,
        "get_authenticated_trainer_athlete_overview",
        fake_get,
    )

    overview = asyncio.run(
        trainer_api.get_trainer_athlete_overview_endpoint(
            "athlete-1",
            trainer=asyncio.run(trainer_user()),
        )
    )

    assert overview.athlete_id == "athlete-1"
    assert overview.display_name == "Athlete One"
    assert overview.health.weight_kg == 81.4


def test_foreign_trainer_athlete_overview_is_not_found(monkeypatch):
    from app.domains.trainer import router as trainer_api

    async def fake_get(_trainer, _athlete_id):
        return None

    monkeypatch.setattr(
        trainer_api,
        "get_authenticated_trainer_athlete_overview",
        fake_get,
    )

    try:
        asyncio.run(
            trainer_api.get_trainer_athlete_overview_endpoint(
                "foreign-athlete",
                trainer=asyncio.run(trainer_user()),
            )
        )
    except HTTPException as exc:
        assert exc.status_code == 404
        assert exc.detail == "Trainer athlete not found"
    else:
        raise AssertionError(
            "Expected HTTPException"
        )


def test_trainer_can_list_strength_sessions(monkeypatch):
    from app.domains.trainer import router as trainer_api
    from app.domains.trainer.models import TrainerStrengthSession

    async def fake_list(trainer, athlete_id):
        assert trainer.id == "trainer-123"
        assert athlete_id == "athlete-1"
        return [
            TrainerStrengthSession.model_validate(
                {
                    "workout_id": "workout-1",
                    "routine_id": "routine-strength",
                    "session_id": "push",
                    "session_name": "Empuje",
                    "started_at": "2026-09-02T08:30:00Z",
                    "finished_at": "2026-09-02T09:30:00Z",
                    "exercises": [
                        {
                            "exercise_id": "bench-press",
                            "exercise_name": "Press de banca",
                            "sets": [
                                {
                                    "set_index": 0,
                                    "set_order": 1,
                                    "set_type": "working",
                                    "reps": 8,
                                    "weight_kg": 30,
                                    "rir": 2,
                                    "rpe": None,
                                    "duration_seconds": None,
                                }
                            ],
                        }
                    ],
                }
            )
        ]

    monkeypatch.setattr(
        trainer_api,
        "list_authenticated_trainer_strength_sessions",
        fake_list,
    )

    sessions = asyncio.run(
        trainer_api.list_trainer_athlete_strength_sessions_endpoint(
            "athlete-1",
            trainer=asyncio.run(trainer_user()),
        )
    )

    assert sessions[0].workout_id == "workout-1"
    assert (
        sessions[0].exercises[0].sets[0].rir
        == 2
    )


def test_strength_sessions_upstream_error_is_generic(monkeypatch):
    from app.domains.trainer import router as trainer_api

    request = httpx.Request(
        "POST",
        (
            "https://example.supabase.co/rest/v1/rpc/"
            "trainer_list_athlete_strength_sessions"
        ),
    )
    response = httpx.Response(
        400,
        request=request,
        content=b"database detail",
    )

    async def fake_list(_trainer, _athlete_id):
        raise httpx.HTTPStatusError(
            "Bad Request",
            request=request,
            response=response,
        )

    monkeypatch.setattr(
        trainer_api,
        "list_authenticated_trainer_strength_sessions",
        fake_list,
    )

    try:
        asyncio.run(
            trainer_api.list_trainer_athlete_strength_sessions_endpoint(
                "athlete-1",
                trainer=asyncio.run(trainer_user()),
            )
        )
    except HTTPException as exc:
        assert exc.status_code == 502
        assert exc.detail == (
            "Could not load trainer strength sessions"
        )
    else:
        raise AssertionError(
            "Expected HTTPException"
        )


def test_trainer_can_list_swimming_sessions(monkeypatch):
    from app.domains.trainer import router as trainer_api
    from app.domains.trainer.models import TrainerPerformanceSession

    async def fake_list(trainer, athlete_id):
        assert trainer.id == "trainer-123"
        assert athlete_id == "athlete-1"
        return [
            TrainerPerformanceSession(
                id="swim-1",
                discipline="swimming",
                title="Natación",
                event_at="2026-09-01T07:00:00Z",
                started_at="2026-09-01T07:00:00Z",
                duration_seconds=2700,
                source="garmin_fit",
            )
        ]

    monkeypatch.setattr(
        trainer_api,
        "list_authenticated_trainer_swimming_sessions",
        fake_list,
    )

    sessions = asyncio.run(
        trainer_api.list_trainer_athlete_swimming_sessions_endpoint(
            "athlete-1",
            trainer=asyncio.run(trainer_user()),
        )
    )

    assert sessions[0].discipline == "swimming"
    assert sessions[0].title == "Natación"


def test_trainer_can_list_running_sessions(monkeypatch):
    from app.domains.trainer import router as trainer_api
    from app.domains.trainer.models import TrainerPerformanceSession

    async def fake_list(trainer, athlete_id):
        assert trainer.id == "trainer-123"
        assert athlete_id == "athlete-1"
        return [
            TrainerPerformanceSession(
                id="run-1",
                discipline="running",
                title="Control aeróbico",
                event_at="2026-09-03T06:40:00Z",
                routine_id="run-routine",
                session_id="run-session",
                started_at="2026-09-03T06:00:00Z",
                finished_at="2026-09-03T06:40:00Z",
            )
        ]

    monkeypatch.setattr(
        trainer_api,
        "list_authenticated_trainer_running_sessions",
        fake_list,
    )

    sessions = asyncio.run(
        trainer_api.list_trainer_athlete_running_sessions_endpoint(
            "athlete-1",
            trainer=asyncio.run(trainer_user()),
        )
    )

    assert sessions[0].discipline == "running"
    assert sessions[0].title == "Control aeróbico"


def test_trainer_can_get_swimming_session_detail(monkeypatch):
    from app.domains.trainer import router as trainer_api
    from app.domains.trainer.models import TrainerSwimmingSessionDetail

    async def fake_get(trainer, athlete_id, session_id):
        assert trainer.id == "trainer-123"
        assert athlete_id == "athlete-1"
        assert session_id == "swim-1"
        return TrainerSwimmingSessionDetail(
            id="swim-1",
            discipline="swimming",
            title="Natación",
            event_at="2026-09-01T07:00:00Z",
            started_at="2026-09-01T07:00:00Z",
            duration_seconds=2439,
            total_distance_meters=1200,
            pool_length_meters=25,
            total_elapsed_time_seconds=2500,
            total_timer_time_seconds=2439,
            total_moving_time_seconds=2016,
            average_pace_seconds_per_100m=168.07,
            total_strokes=758,
            heart_rate_average_bpm=138,
            heart_rate_max_bpm=162,
            total_calories=389,
            aerobic_training_effect=3.3,
            anaerobic_training_effect=2.3,
            average_stroke_rate_spm=23,
            average_speed_meters_per_second=0.595,
            max_speed_meters_per_second=1.724,
            objective=None,
            technical_focus=[],
            lengths=[],
        )

    monkeypatch.setattr(
        trainer_api,
        "get_authenticated_trainer_swimming_session",
        fake_get,
    )

    session = asyncio.run(
        trainer_api.get_trainer_athlete_swimming_session_endpoint(
            "athlete-1",
            "swim-1",
            trainer=asyncio.run(trainer_user()),
        )
    )

    assert session.id == "swim-1"
    assert session.total_distance_meters == 1200
    assert session.heart_rate_average_bpm == 138
    assert session.total_strokes == 758


def test_missing_swimming_session_detail_returns_404(monkeypatch):
    from app.domains.trainer import router as trainer_api

    async def fake_get(_trainer, _athlete_id, _session_id):
        return None

    monkeypatch.setattr(
        trainer_api,
        "get_authenticated_trainer_swimming_session",
        fake_get,
    )

    try:
        asyncio.run(
            trainer_api.get_trainer_athlete_swimming_session_endpoint(
                "athlete-1",
                "missing",
                trainer=asyncio.run(trainer_user()),
            )
        )
    except HTTPException as exc:
        assert exc.status_code == 404
    else:
        raise AssertionError(
            "Expected HTTPException"
        )


def test_normal_user_cannot_list_swimming_sessions():
    app.dependency_overrides[
        require_user
    ] = normal_user

    try:
        response = client.get(
            (
                "/api/v1/trainer/athletes/"
                "athlete-1/swimming-sessions"
            ),
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

    assert response.status_code == 403


def test_admin_cannot_list_running_sessions():
    app.dependency_overrides[
        require_user
    ] = admin_user

    try:
        response = client.get(
            (
                "/api/v1/trainer/athletes/"
                "athlete-1/running-sessions"
            ),
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

    assert response.status_code == 403


def test_trainer_athletes_route_does_not_accept_trainer_id_parameter(
    monkeypatch,
):
    from app.domains.trainer import router as trainer_api

    seen = []

    async def fake_list(trainer):
        seen.append(trainer.id)
        return []

    app.dependency_overrides[
        require_user
    ] = trainer_user
    monkeypatch.setattr(
        trainer_api,
        "list_authenticated_trainer_athletes",
        fake_list,
    )

    try:
        response = client.get(
            (
                "/api/v1/trainer/athletes"
                "?trainer_id=other-trainer"
            ),
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
    assert seen == [
        "trainer-123"
    ]

    route = next(
        route
        for route in app.routes
        if getattr(route, "path", None)
        == "/api/v1/trainer/athletes"
    )
    assert [
        param.name
        for param in route.dependant.query_params
    ] == []


def _template_payload():
    return {
        "id": "template-1",
        "name": "Base strength",
        "discipline": "strength",
        "data": {
            "routineId": "template-1",
            "schemaVersion": "4.2",
            "revision": 1,
            "discipline": "strength",
            "sessions": [],
        },
    }


def _template_response(template_id="template-1"):
    return {
        "id": template_id,
        "name": "Base strength",
        "discipline": "strength",
        "data": {
            "routineId": template_id,
            "schemaVersion": "4.2",
            "revision": 1,
            "discipline": "strength",
            "sessions": [],
        },
        "created_at": "2026-09-02T10:00:00Z",
        "updated_at": "2026-09-02T10:00:00Z",
    }


def test_trainer_templates_require_authentication():
    response = client.get(
        "/api/v1/trainer/templates"
    )

    assert response.status_code == 401


def test_normal_user_cannot_list_trainer_templates():
    app.dependency_overrides[
        require_user
    ] = normal_user

    try:
        response = client.get(
            "/api/v1/trainer/templates",
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

    assert response.status_code == 403


def test_admin_cannot_list_trainer_templates():
    app.dependency_overrides[
        require_user
    ] = admin_user

    try:
        response = client.get(
            "/api/v1/trainer/templates",
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

    assert response.status_code == 403


def test_trainer_can_list_templates_with_discipline_filter(
    monkeypatch,
):
    from app.domains.trainer import router as trainer_api

    seen = {}

    async def fake_list(trainer, discipline=None):
        seen["trainer_id"] = trainer.id
        seen["discipline"] = discipline
        return [
            _template_response()
        ]

    app.dependency_overrides[
        require_user
    ] = trainer_user
    monkeypatch.setattr(
        trainer_api,
        "list_authenticated_trainer_templates",
        fake_list,
    )

    try:
        response = client.get(
            "/api/v1/trainer/templates?discipline=strength",
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
    assert response.json() == [
        _template_response()
    ]
    assert seen == {
        "trainer_id": "trainer-123",
        "discipline": "strength",
    }


def test_trainer_can_get_template(monkeypatch):
    from app.domains.trainer import router as trainer_api

    async def fake_get(trainer, template_id):
        assert trainer.id == "trainer-123"
        assert template_id == "template-1"
        return _template_response()

    app.dependency_overrides[
        require_user
    ] = trainer_user
    monkeypatch.setattr(
        trainer_api,
        "get_authenticated_trainer_template",
        fake_get,
    )

    try:
        response = client.get(
            "/api/v1/trainer/templates/template-1",
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
    assert response.json()["id"] == "template-1"


def test_foreign_trainer_template_get_returns_404(monkeypatch):
    from app.domains.trainer import router as trainer_api

    async def fake_get(trainer, template_id):
        assert trainer.id == "trainer-123"
        return None

    app.dependency_overrides[
        require_user
    ] = trainer_user
    monkeypatch.setattr(
        trainer_api,
        "get_authenticated_trainer_template",
        fake_get,
    )

    try:
        response = client.get(
            "/api/v1/trainer/templates/foreign-template",
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


def test_trainer_can_create_template_without_trainer_id_override(
    monkeypatch,
):
    from app.domains.trainer import router as trainer_api

    seen = {}

    async def fake_create(trainer, request):
        seen["trainer_id"] = trainer.id
        seen["request"] = request
        return _template_response()

    app.dependency_overrides[
        require_user
    ] = trainer_user
    monkeypatch.setattr(
        trainer_api,
        "create_authenticated_trainer_template",
        fake_create,
    )

    try:
        response = client.post(
            "/api/v1/trainer/templates",
            headers={
                "Authorization":
                    "Bearer token-123"
            },
            json=_template_payload(),
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 201
    assert seen["trainer_id"] == "trainer-123"
    assert not hasattr(
        seen["request"],
        "trainer_id",
    )


def test_create_template_rejects_trainer_id_body_override():
    app.dependency_overrides[
        require_user
    ] = trainer_user

    payload = {
        **_template_payload(),
        "trainer_id": "other-trainer",
    }

    try:
        response = client.post(
            "/api/v1/trainer/templates",
            headers={
                "Authorization":
                    "Bearer token-123"
            },
            json=payload,
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 422


def test_trainer_can_update_template(monkeypatch):
    from app.domains.trainer import router as trainer_api

    seen = {}

    async def fake_update(trainer, template_id, request):
        seen["trainer_id"] = trainer.id
        seen["template_id"] = template_id
        seen["request"] = request
        return _template_response()

    app.dependency_overrides[
        require_user
    ] = trainer_user
    monkeypatch.setattr(
        trainer_api,
        "replace_authenticated_trainer_template",
        fake_update,
    )

    payload = _template_payload()
    payload.pop("id")

    try:
        response = client.put(
            "/api/v1/trainer/templates/template-1",
            headers={
                "Authorization":
                    "Bearer token-123"
            },
            json=payload,
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 200
    assert seen["trainer_id"] == "trainer-123"
    assert seen["template_id"] == "template-1"
    assert not hasattr(
        seen["request"],
        "trainer_id",
    )


def test_foreign_trainer_template_update_returns_404(monkeypatch):
    from app.domains.trainer import router as trainer_api

    async def fake_update(trainer, template_id, request):
        assert trainer.id == "trainer-123"
        return None

    app.dependency_overrides[
        require_user
    ] = trainer_user
    monkeypatch.setattr(
        trainer_api,
        "replace_authenticated_trainer_template",
        fake_update,
    )

    payload = _template_payload()
    payload.pop("id")

    try:
        response = client.put(
            "/api/v1/trainer/templates/foreign-template",
            headers={
                "Authorization":
                    "Bearer token-123"
            },
            json=payload,
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 404


def test_update_template_rejects_trainer_id_body_override():
    app.dependency_overrides[
        require_user
    ] = trainer_user

    payload = _template_payload()
    payload.pop("id")
    payload["trainer_id"] = "other-trainer"

    try:
        response = client.put(
            "/api/v1/trainer/templates/template-1",
            headers={
                "Authorization":
                    "Bearer token-123"
            },
            json=payload,
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 422


def test_trainer_can_delete_template(monkeypatch):
    from app.domains.trainer import router as trainer_api

    seen = {}

    async def fake_delete(trainer, template_id):
        seen["trainer_id"] = trainer.id
        seen["template_id"] = template_id
        return True

    app.dependency_overrides[
        require_user
    ] = trainer_user
    monkeypatch.setattr(
        trainer_api,
        "delete_authenticated_trainer_template",
        fake_delete,
    )

    try:
        response = client.delete(
            "/api/v1/trainer/templates/template-1",
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

    assert response.status_code == 204
    assert seen == {
        "trainer_id": "trainer-123",
        "template_id": "template-1",
    }


def test_foreign_trainer_template_delete_returns_404(monkeypatch):
    from app.domains.trainer import router as trainer_api

    async def fake_delete(trainer, template_id):
        assert trainer.id == "trainer-123"
        return False

    app.dependency_overrides[
        require_user
    ] = trainer_user
    monkeypatch.setattr(
        trainer_api,
        "delete_authenticated_trainer_template",
        fake_delete,
    )

    try:
        response = client.delete(
            "/api/v1/trainer/templates/foreign-template",
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


@pytest.mark.parametrize(
    "upstream_status,upstream_body,expected_status",
    [
        (409, {"code": "23503"}, 409),
        (409, {"code": "23505"}, 502),
        (409, {}, 502),
        (409, [], 502),
        (409, "not-json", 502),
        (500, {"code": "23503"}, 502),
        (503, {"code": "08006"}, 502),
    ],
)
def test_delete_template_classifies_only_upstream_foreign_key_conflicts(
    monkeypatch, upstream_status, upstream_body, expected_status
):
    from app.domains.trainer import repository

    real_client = httpx.AsyncClient

    def upstream(request):
        assert request.method == "DELETE"
        assert request.url.path == "/rest/v1/trainer_routine_templates"
        assert request.url.params["trainer_id"] == "eq.trainer-123"
        assert request.url.params["id"] == "eq.template-1"
        assert request.headers["Authorization"] == "Bearer token-123"
        if isinstance(upstream_body, str):
            return httpx.Response(upstream_status, text=upstream_body)
        return httpx.Response(upstream_status, json=upstream_body)

    # Exercise the real repository -> service -> router path using a fake upstream.
    monkeypatch.setattr(repository, "_supabase_config", lambda: ("https://example.supabase.co", "test-key"))
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(upstream), **kwargs),
    )
    app.dependency_overrides[require_user] = trainer_user
    try:
        response = client.delete(
            "/api/v1/trainer/templates/template-1",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)

    assert response.status_code == expected_status
    assert response.json() == {
        "detail": (
            "Trainer template has existing assignments and cannot be deleted"
            if expected_status == 409
            else "Could not delete trainer template"
        )
    }


@pytest.mark.parametrize("user", [normal_user, admin_user])
def test_delete_template_still_requires_trainer_role(monkeypatch, user):
    from app.domains.trainer import router as trainer_api

    async def unexpected_delete(*args):
        pytest.fail("Unauthorized deletion reached the service")

    monkeypatch.setattr(trainer_api, "delete_authenticated_trainer_template", unexpected_delete)
    app.dependency_overrides[require_user] = user
    try:
        response = client.delete(
            "/api/v1/trainer/templates/template-1",
            headers={"Authorization": "Bearer token-123"},
        )
    finally:
        app.dependency_overrides.pop(require_user, None)
    assert response.status_code == 403


def test_delete_template_still_requires_authentication():
    response = client.delete("/api/v1/trainer/templates/template-1")
    assert response.status_code == 401


def test_trainer_templates_route_does_not_accept_trainer_id_query():
    route = next(
        route
        for route in app.routes
        if getattr(route, "path", None)
        == "/api/v1/trainer/templates"
    )
    assert [
        param.name
        for param in route.dependant.query_params
    ] == [
        "discipline"
    ]


def _assignment_payload():
    return {
        "athlete_id": "athlete-1",
        "routine_id": "athlete-routine-1",
    }


def _assignment_response():
    return {
        "assignment_id": "assignment-1",
        "athlete_id": "athlete-1",
        "template_id": "template-1",
        "routine_id": "athlete-routine-1",
        "discipline": "strength",
        "assigned_at": "2026-09-02T10:00:00Z",
    }


def test_assign_template_requires_authentication():
    response = client.post(
        "/api/v1/trainer/templates/template-1/assign",
        json=_assignment_payload(),
    )

    assert response.status_code == 401


def test_normal_user_cannot_assign_template():
    app.dependency_overrides[
        require_user
    ] = normal_user

    try:
        response = client.post(
            "/api/v1/trainer/templates/template-1/assign",
            headers={
                "Authorization":
                    "Bearer token-123"
            },
            json=_assignment_payload(),
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 403


def test_admin_cannot_assign_template():
    app.dependency_overrides[
        require_user
    ] = admin_user

    try:
        response = client.post(
            "/api/v1/trainer/templates/template-1/assign",
            headers={
                "Authorization":
                    "Bearer token-123"
            },
            json=_assignment_payload(),
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 403


def test_trainer_can_assign_template(monkeypatch):
    from app.domains.trainer import router as trainer_api

    seen = {}

    async def fake_assign(trainer, template_id, request):
        seen["trainer_id"] = trainer.id
        seen["template_id"] = template_id
        seen["request"] = request
        return _assignment_response()

    app.dependency_overrides[
        require_user
    ] = trainer_user
    monkeypatch.setattr(
        trainer_api,
        "assign_authenticated_trainer_template",
        fake_assign,
    )

    try:
        response = client.post(
            "/api/v1/trainer/templates/template-1/assign",
            headers={
                "Authorization":
                    "Bearer token-123"
            },
            json=_assignment_payload(),
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 201
    assert response.json() == _assignment_response()
    assert seen["trainer_id"] == "trainer-123"
    assert seen["template_id"] == "template-1"
    assert not hasattr(
        seen["request"],
        "trainer_id",
    )


def test_assign_template_rejects_trainer_id_override():
    app.dependency_overrides[
        require_user
    ] = trainer_user

    try:
        response = client.post(
            "/api/v1/trainer/templates/template-1/assign",
            headers={
                "Authorization":
                    "Bearer token-123"
            },
            json={
                **_assignment_payload(),
                "trainer_id": "other-trainer",
            },
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 422


def test_assign_foreign_template_returns_404(monkeypatch):
    from app.domains.trainer import router as trainer_api
    from app.domains.trainer.service import TrainerTemplateNotFound

    async def fake_assign(trainer, template_id, request):
        raise TrainerTemplateNotFound(
            "Trainer template not found"
        )

    app.dependency_overrides[
        require_user
    ] = trainer_user
    monkeypatch.setattr(
        trainer_api,
        "assign_authenticated_trainer_template",
        fake_assign,
    )

    try:
        response = client.post(
            "/api/v1/trainer/templates/foreign-template/assign",
            headers={
                "Authorization":
                    "Bearer token-123"
            },
            json=_assignment_payload(),
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 404


def test_assign_unrelated_or_inactive_athlete_returns_404(monkeypatch):
    from app.domains.trainer import router as trainer_api
    from app.domains.trainer.service import (
        TrainerAthleteRelationshipNotFound,
    )

    async def fake_assign(trainer, template_id, request):
        raise TrainerAthleteRelationshipNotFound(
            "Trainer athlete relationship not found"
        )

    app.dependency_overrides[
        require_user
    ] = trainer_user
    monkeypatch.setattr(
        trainer_api,
        "assign_authenticated_trainer_template",
        fake_assign,
    )

    try:
        response = client.post(
            "/api/v1/trainer/templates/template-1/assign",
            headers={
                "Authorization":
                    "Bearer token-123"
            },
            json=_assignment_payload(),
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 404


def test_assign_duplicate_routine_id_returns_409(monkeypatch):
    from app.domains.trainer import router as trainer_api

    async def fake_assign(trainer, template_id, request):
        http_request = httpx.Request(
            "POST",
            "https://example.supabase.co/rest/v1/rpc/"
            "trainer_assign_routine_template",
        )
        response = httpx.Response(
            409,
            request=http_request,
        )
        raise httpx.HTTPStatusError(
            "conflict",
            request=http_request,
            response=response,
        )

    app.dependency_overrides[
        require_user
    ] = trainer_user
    monkeypatch.setattr(
        trainer_api,
        "assign_authenticated_trainer_template",
        fake_assign,
    )

    try:
        response = client.post(
            "/api/v1/trainer/templates/template-1/assign",
            headers={
                "Authorization":
                    "Bearer token-123"
            },
            json=_assignment_payload(),
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Routine already exists"
    }
