import asyncio
import inspect
import logging

import httpx

from app.core.auth import AuthenticatedUser
from app.domains.trainer.models import (
    TrainerAthlete,
    TrainerAthleteOverview,
    TrainerPerformanceSession,
    TrainerStrengthSession,
)
from app.domains.trainer import repository, service


def _trainer() -> AuthenticatedUser:
    return AuthenticatedUser(
        id="trainer-123",
        email="trainer@example.com",
        access_token="access-token",
        role="trainer",
    )


def _overview_row():
    return {
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


def _strength_session_row():
    return {
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
                    },
                    {
                        "set_index": 1,
                        "set_order": 2,
                        "set_type": "working",
                        "reps": None,
                        "weight_kg": None,
                        "rir": None,
                        "rpe": None,
                        "duration_seconds": None,
                    },
                ],
            }
        ],
    }


def _swimming_detail_row():
    return {
        "id": "swim-1",
        "discipline": "swimming",
        "title": "Natación",
        "event_at": "2026-09-01T07:00:00Z",
        "started_at": "2026-09-01T07:00:00Z",
        "duration_seconds": 2439,
        "total_distance_meters": 1200,
        "pool_length_meters": 25,
        "total_elapsed_time_seconds": 2500,
        "total_timer_time_seconds": 2439,
        "total_moving_time_seconds": 2016,
        "average_pace_seconds_per_100m": 168.07,
        "objective": None,
        "technical_focus": [],
        "lengths": [
            {
                "start_time": "2026-09-01T07:00:00Z",
                "duration_seconds": 30,
                "distance_meters": 25,
                "total_strokes": 16,
                "average_stroke_rate_spm": 23,
                "stroke": "freestyle",
                "length_type": "active",
            }
        ],
    }


def test_list_active_trainer_athletes_filters_authenticated_trainer(
    monkeypatch,
):
    monkeypatch.setenv(
        "SUPABASE_URL",
        "https://example.supabase.co",
    )
    monkeypatch.setenv(
        "SUPABASE_PUBLISHABLE_KEY",
        "publishable-key",
    )

    captured = {}

    class FakeResponse:
        is_error = False

        def raise_for_status(self):
            pass

        def json(self):
            return [
                {
                    "athlete_id": "athlete-1",
                    "status": "active",
                    "email": "athlete@example.com",
                    "display_name": "Athlete One",
                    "client_since": "2026-08-15T10:00:00Z",
                }
            ]

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

        async def post(self, url, headers, json):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return FakeResponse()

        async def get(self, url, headers, params):
            raise AssertionError(
                "list athletes must use the identity RPC"
            )

    monkeypatch.setattr(
        repository.httpx,
        "AsyncClient",
        FakeClient,
    )

    rows = asyncio.run(
        repository.list_active_trainer_athletes(
            _trainer()
        )
    )

    assert rows == [
        {
            "athlete_id": "athlete-1",
            "status": "active",
            "email": "athlete@example.com",
            "display_name": "Athlete One",
            "client_since": "2026-08-15T10:00:00Z",
        }
    ]
    assert captured["timeout"] == 10.0
    assert captured["url"] == (
        "https://example.supabase.co/rest/v1/rpc/"
        "trainer_list_athlete_identities"
    )
    assert captured["headers"] == {
        "Authorization": "Bearer access-token",
        "apikey": "publishable-key",
        "Content-Type": "application/json",
    }
    assert captured["json"] == {}


def test_list_active_trainer_athletes_logs_upstream_error_without_secrets(
    monkeypatch,
    caplog,
):
    monkeypatch.setenv(
        "SUPABASE_URL",
        "https://example.supabase.co",
    )
    monkeypatch.setenv(
        "SUPABASE_PUBLISHABLE_KEY",
        "publishable-key",
    )

    class FakeResponse:
        is_error = True
        status_code = 400
        text = (
            '{"code":"PGRST202",'
            '"message":"Could not find function"}'
        )
        headers = {
            "x-request-id":
                "supabase-request-1"
        }

        def raise_for_status(self):
            request = httpx.Request(
                "POST",
                (
                    "https://example.supabase.co"
                    "/rest/v1/rpc/"
                    "trainer_list_athlete_identities"
                ),
            )
            response = httpx.Response(
                self.status_code,
                request=request,
                content=self.text.encode(),
            )
            raise httpx.HTTPStatusError(
                "Bad Request",
                request=request,
                response=response,
            )

    class FakeClient:
        def __init__(self, timeout):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

        async def post(self, url, headers, json):
            return FakeResponse()

    monkeypatch.setattr(
        repository.httpx,
        "AsyncClient",
        FakeClient,
    )

    with caplog.at_level(
        logging.WARNING,
        logger="uvicorn.error.aptus.trainer",
    ):
        try:
            asyncio.run(
                repository.list_active_trainer_athletes(
                    _trainer()
                )
            )
        except httpx.HTTPStatusError:
            pass

    log_text = caplog.text

    assert (
        "trainer_athlete_identities_rpc_failed"
        in log_text
    )
    assert "trainer_list_athlete_identities" in log_text
    assert "supabase-request-1" in log_text
    assert "PGRST202" in log_text
    assert "access-token" not in log_text
    assert "publishable-key" not in log_text
    assert "authorization" not in log_text.lower()
    assert "apikey" not in log_text.lower()


def test_trainer_service_exposes_no_foreign_trainer_selector():
    signature = inspect.signature(
        service.list_authenticated_trainer_athletes
    )

    assert list(signature.parameters) == [
        "trainer"
    ]


def test_trainer_athlete_contract_includes_client_since():
    athlete = TrainerAthlete.model_validate(
        {
            "athlete_id": "athlete-1",
            "status": "active",
            "email": "athlete@example.com",
            "display_name": "Athlete One",
            "client_since": "2026-08-15T10:00:00Z",
        }
    )

    assert (
        athlete.client_since.isoformat()
        == "2026-08-15T10:00:00+00:00"
    )


def test_get_trainer_athlete_overview_uses_rpc_and_authenticated_token(
    monkeypatch,
):
    monkeypatch.setenv(
        "SUPABASE_URL",
        "https://example.supabase.co",
    )
    monkeypatch.setenv(
        "SUPABASE_PUBLISHABLE_KEY",
        "publishable-key",
    )

    captured = {}
    overview = _overview_row()

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [overview]

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

        async def post(self, url, headers, json):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return FakeResponse()

        async def get(self, url, headers, params):
            raise AssertionError(
                "overview must use the overview RPC"
            )

    monkeypatch.setattr(
        repository.httpx,
        "AsyncClient",
        FakeClient,
    )

    row = asyncio.run(
        repository.get_trainer_athlete_overview(
            _trainer(),
            "athlete-1",
        )
    )

    assert row == overview
    assert captured["timeout"] == 10.0
    assert captured["url"] == (
        "https://example.supabase.co/rest/v1/rpc/"
        "trainer_get_athlete_overview"
    )
    assert captured["headers"] == {
        "Authorization": "Bearer access-token",
        "apikey": "publishable-key",
        "Content-Type": "application/json",
    }
    assert captured["json"] == {
        "p_athlete_id": "athlete-1",
    }


def test_get_trainer_athlete_overview_returns_none_for_foreign_athlete(
    monkeypatch,
):
    monkeypatch.setenv(
        "SUPABASE_URL",
        "https://example.supabase.co",
    )
    monkeypatch.setenv(
        "SUPABASE_PUBLISHABLE_KEY",
        "publishable-key",
    )

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return []

    class FakeClient:
        def __init__(self, timeout):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

        async def post(self, url, headers, json):
            return FakeResponse()

    monkeypatch.setattr(
        repository.httpx,
        "AsyncClient",
        FakeClient,
    )

    assert (
        asyncio.run(
            repository.get_trainer_athlete_overview(
                _trainer(),
                "foreign-athlete",
            )
        )
        is None
    )


def test_trainer_athlete_overview_contract_validates_sections():
    overview = TrainerAthleteOverview.model_validate(
        _overview_row()
    )

    assert overview.athlete_id == "athlete-1"
    assert overview.health.weight_kg == 81.4
    assert (
        overview.recent_training
        .last_completed
        .session_name
        == "Empuje"
    )
    assert (
        overview.active_routines
        .strength
        .name
        == "Plan fuerza"
    )
    assert (
        overview.trainer
        .last_assignment
        .name
        == "Base fuerza"
    )


def test_list_strength_sessions_uses_rpc_and_authenticated_token(
    monkeypatch,
):
    monkeypatch.setenv(
        "SUPABASE_URL",
        "https://example.supabase.co",
    )
    monkeypatch.setenv(
        "SUPABASE_PUBLISHABLE_KEY",
        "publishable-key",
    )

    captured = {}
    rows = [
        _strength_session_row()
    ]

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return rows

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

        async def post(self, url, headers, json):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(
        repository.httpx,
        "AsyncClient",
        FakeClient,
    )

    result = asyncio.run(
        repository.list_trainer_athlete_strength_sessions(
            _trainer(),
            "athlete-1",
        )
    )

    assert result == rows
    assert captured["timeout"] == 10.0
    assert captured["url"] == (
        "https://example.supabase.co/rest/v1/rpc/"
        "trainer_list_athlete_strength_sessions"
    )
    assert captured["headers"] == {
        "Authorization": "Bearer access-token",
        "apikey": "publishable-key",
        "Content-Type": "application/json",
    }
    assert captured["json"] == {
        "p_athlete_id": "athlete-1",
    }


def test_strength_session_contract_tolerates_nulls():
    session = TrainerStrengthSession.model_validate(
        _strength_session_row()
    )

    assert session.workout_id == "workout-1"
    assert session.session_name == "Empuje"
    assert (
        session.exercises[0].exercise_name
        == "Press de banca"
    )
    assert session.exercises[0].sets[1].reps is None
    assert session.exercises[0].sets[0].set_index == 0
    assert session.exercises[0].sets[0].set_order == 1
    assert session.exercises[0].sets[0].set_type == "working"


def test_strength_session_service_exposes_no_foreign_trainer_selector():
    signature = inspect.signature(
        service.list_authenticated_trainer_strength_sessions
    )

    assert list(signature.parameters) == [
        "trainer",
        "athlete_id",
    ]


def test_list_swimming_sessions_calls_trainer_rpc(monkeypatch):
    monkeypatch.setenv(
        "SUPABASE_URL",
        "https://example.supabase.co/",
    )
    monkeypatch.setenv(
        "SUPABASE_PUBLISHABLE_KEY",
        "publishable-key",
    )

    rows = [
        {
            "id": "swim-1",
            "discipline": "swimming",
            "title": "Natación",
            "event_at": "2026-09-01T07:00:00Z",
            "started_at": "2026-09-01T07:00:00Z",
            "duration_seconds": 2700,
            "source": "garmin_fit",
        }
    ]
    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return rows

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, headers, json):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(
        repository.httpx,
        "AsyncClient",
        FakeClient,
    )

    result = asyncio.run(
        repository.list_trainer_athlete_swimming_sessions(
            _trainer(),
            "athlete-1",
        )
    )

    assert result == rows
    assert captured["timeout"] == 10.0
    assert captured["url"] == (
        "https://example.supabase.co/rest/v1/rpc/"
        "trainer_list_athlete_swimming_sessions"
    )
    assert captured["headers"] == {
        "Authorization": "Bearer access-token",
        "apikey": "publishable-key",
        "Content-Type": "application/json",
    }
    assert captured["json"] == {
        "p_athlete_id": "athlete-1",
    }


def test_list_running_sessions_calls_trainer_rpc(monkeypatch):
    monkeypatch.setenv(
        "SUPABASE_URL",
        "https://example.supabase.co/",
    )
    monkeypatch.setenv(
        "SUPABASE_PUBLISHABLE_KEY",
        "publishable-key",
    )

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return [
                {
                    "id": "run-1",
                    "discipline": "running",
                    "title": "Control aeróbico",
                    "event_at": "2026-09-03T06:40:00Z",
                    "routine_id": "run-routine",
                    "session_id": "run-session",
                    "started_at": "2026-09-03T06:00:00Z",
                    "finished_at": "2026-09-03T06:40:00Z",
                }
            ]

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, headers, json):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(
        repository.httpx,
        "AsyncClient",
        FakeClient,
    )

    result = asyncio.run(
        repository.list_trainer_athlete_running_sessions(
            _trainer(),
            "athlete-1",
        )
    )

    assert result[0]["discipline"] == "running"
    assert captured["timeout"] == 10.0
    assert captured["url"] == (
        "https://example.supabase.co/rest/v1/rpc/"
        "trainer_list_athlete_running_sessions"
    )
    assert captured["json"] == {
        "p_athlete_id": "athlete-1",
    }


def test_performance_session_contract_tolerates_optional_ids():
    session = TrainerPerformanceSession.model_validate(
        {
            "id": "swim-1",
            "discipline": "swimming",
            "title": "Natación",
            "event_at": "2026-09-01T07:00:00Z",
            "started_at": "2026-09-01T07:00:00Z",
            "duration_seconds": 2700,
            "source": "garmin_fit",
        }
    )

    assert session.id == "swim-1"
    assert session.routine_id is None
    assert session.event_at == "2026-09-01T07:00:00Z"


def test_get_swimming_session_calls_trainer_rpc(monkeypatch):
    monkeypatch.setenv(
        "SUPABASE_URL",
        "https://example.supabase.co/",
    )
    monkeypatch.setenv(
        "SUPABASE_PUBLISHABLE_KEY",
        "publishable-key",
    )

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return [
                _swimming_detail_row()
            ]

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, headers, json):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(
        repository.httpx,
        "AsyncClient",
        FakeClient,
    )

    result = asyncio.run(
        repository.get_trainer_athlete_swimming_session(
            _trainer(),
            "athlete-1",
            "swim-1",
        )
    )

    assert result == _swimming_detail_row()
    assert captured["timeout"] == 10.0
    assert captured["url"] == (
        "https://example.supabase.co/rest/v1/rpc/"
        "trainer_get_athlete_swimming_session"
    )
    assert captured["headers"] == {
        "Authorization": "Bearer access-token",
        "apikey": "publishable-key",
        "Content-Type": "application/json",
    }
    assert captured["json"] == {
        "p_athlete_id": "athlete-1",
        "p_session_id": "swim-1",
    }


def test_list_routine_templates_filters_trainer_and_discipline(
    monkeypatch,
):
    monkeypatch.setenv(
        "SUPABASE_URL",
        "https://example.supabase.co",
    )
    monkeypatch.setenv(
        "SUPABASE_PUBLISHABLE_KEY",
        "publishable-key",
    )

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return []

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

        async def get(self, url, headers, params):
            captured["url"] = url
            captured["headers"] = headers
            captured["params"] = params
            return FakeResponse()

    monkeypatch.setattr(
        repository.httpx,
        "AsyncClient",
        FakeClient,
    )

    rows = asyncio.run(
        repository.list_routine_templates(
            _trainer(),
            discipline="swimming",
        )
    )

    assert rows == []
    assert captured["url"] == (
        "https://example.supabase.co/rest/v1/"
        "trainer_routine_templates"
    )
    assert captured["headers"] == {
        "Authorization": "Bearer access-token",
        "apikey": "publishable-key",
    }
    assert captured["params"] == {
        "trainer_id": "eq.trainer-123",
        "select": (
            "id,name,discipline,data,"
            "created_at,updated_at"
        ),
        "order": "updated_at.desc",
        "discipline": "eq.swimming",
    }


def test_template_crud_repository_uses_authenticated_trainer(
    monkeypatch,
):
    monkeypatch.setenv(
        "SUPABASE_URL",
        "https://example.supabase.co",
    )
    monkeypatch.setenv(
        "SUPABASE_PUBLISHABLE_KEY",
        "publishable-key",
    )

    calls = []
    row = {
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
        "created_at": "2026-09-02T10:00:00Z",
        "updated_at": "2026-09-02T10:00:00Z",
    }

    class FakeResponse:
        def __init__(self, payload):
            self.payload = payload

        def raise_for_status(self):
            pass

        def json(self):
            return self.payload

    class FakeClient:
        def __init__(self, timeout):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

        async def get(self, url, headers, params):
            calls.append(("get", headers, params))
            return FakeResponse([row])

        async def post(self, url, headers, params, json):
            calls.append(("post", headers, params, json))
            return FakeResponse([row])

        async def patch(self, url, headers, params, json):
            calls.append(("patch", headers, params, json))
            return FakeResponse([row])

        async def delete(self, url, headers, params):
            calls.append(("delete", headers, params))
            return FakeResponse([{"id": "template-1"}])

    monkeypatch.setattr(
        repository.httpx,
        "AsyncClient",
        FakeClient,
    )

    trainer = _trainer()
    payload = {
        "id": "template-1",
        "name": "Base strength",
        "discipline": "strength",
        "data": row["data"],
    }

    assert asyncio.run(
        repository.get_routine_template_by_id(
            trainer,
            "template-1",
        )
    ) == row
    assert asyncio.run(
        repository.create_routine_template(
            trainer,
            {
                **payload,
                "trainer_id": "other-trainer",
            },
        )
    ) == row
    assert asyncio.run(
        repository.replace_routine_template(
            trainer,
            "template-1",
            {
                **payload,
                "trainer_id": "other-trainer",
            },
        )
    ) == row
    assert asyncio.run(
        repository.delete_routine_template(
            trainer,
            "template-1",
        )
    ) is True

    get_call = calls[0]
    assert get_call[2]["trainer_id"] == "eq.trainer-123"
    assert get_call[2]["id"] == "eq.template-1"

    post_call = calls[1]
    assert post_call[3]["trainer_id"] == "trainer-123"

    patch_call = calls[2]
    assert patch_call[2]["trainer_id"] == "eq.trainer-123"
    assert patch_call[2]["id"] == "eq.template-1"
    assert "trainer_id" not in patch_call[3]
    assert "updated_at" in patch_call[3]
    assert patch_call[3]["updated_at"].endswith("Z")
    assert (
        patch_call[3]["updated_at"]
        != row["updated_at"]
    )

    delete_call = calls[3]
    assert delete_call[2]["trainer_id"] == "eq.trainer-123"
    assert delete_call[2]["id"] == "eq.template-1"


def test_template_service_exposes_no_foreign_trainer_selector():
    for function_name in (
        "list_authenticated_trainer_templates",
        "get_authenticated_trainer_template",
        "create_authenticated_trainer_template",
        "replace_authenticated_trainer_template",
        "delete_authenticated_trainer_template",
    ):
        signature = inspect.signature(
            getattr(service, function_name)
        )
        assert (
            list(signature.parameters)[0]
            == "trainer"
        )


def test_get_active_trainer_athlete_filters_relationship(
    monkeypatch,
):
    monkeypatch.setenv(
        "SUPABASE_URL",
        "https://example.supabase.co",
    )
    monkeypatch.setenv(
        "SUPABASE_PUBLISHABLE_KEY",
        "publishable-key",
    )

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [
                {
                    "athlete_id": "athlete-1",
                    "status": "active",
                }
            ]

    class FakeClient:
        def __init__(self, timeout):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

        async def get(self, url, headers, params):
            captured["url"] = url
            captured["headers"] = headers
            captured["params"] = params
            return FakeResponse()

    monkeypatch.setattr(
        repository.httpx,
        "AsyncClient",
        FakeClient,
    )

    row = asyncio.run(
        repository.get_active_trainer_athlete(
            _trainer(),
            "athlete-1",
        )
    )

    assert row["athlete_id"] == "athlete-1"
    assert captured["url"] == (
        "https://example.supabase.co/rest/v1/"
        "trainer_athletes"
    )
    assert captured["params"] == {
        "trainer_id": "eq.trainer-123",
        "athlete_id": "eq.athlete-1",
        "status": "eq.active",
        "select": "athlete_id,status",
        "limit": "1",
    }


def test_assign_routine_template_calls_rpc_with_authenticated_trainer(
    monkeypatch,
):
    monkeypatch.setenv(
        "SUPABASE_URL",
        "https://example.supabase.co",
    )
    monkeypatch.setenv(
        "SUPABASE_PUBLISHABLE_KEY",
        "publishable-key",
    )

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [
                {
                    "assignment_id": "assignment-1",
                    "athlete_id": "athlete-1",
                    "template_id": "template-1",
                    "routine_id": "routine-1",
                    "discipline": "strength",
                    "assigned_at": "2026-09-02T10:00:00Z",
                }
            ]

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

        async def post(self, url, headers, json):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(
        repository.httpx,
        "AsyncClient",
        FakeClient,
    )

    row = asyncio.run(
        repository.assign_routine_template(
            _trainer(),
            athlete_id="athlete-1",
            template_id="template-1",
            routine_id="routine-1",
        )
    )

    assert row["assignment_id"] == "assignment-1"
    assert captured["url"] == (
        "https://example.supabase.co/rest/v1/rpc/"
        "trainer_assign_routine_template"
    )
    assert captured["headers"] == {
        "Authorization": "Bearer access-token",
        "apikey": "publishable-key",
        "Content-Type": "application/json",
    }
    assert captured["json"] == {
        "p_athlete_id": "athlete-1",
        "p_template_id": "template-1",
        "p_routine_id": "routine-1",
    }
    assert set(captured["json"]) == {
        "p_athlete_id",
        "p_template_id",
        "p_routine_id",
    }


def test_assign_routine_template_propagates_duplicate_conflict(
    monkeypatch,
):
    monkeypatch.setenv(
        "SUPABASE_URL",
        "https://example.supabase.co",
    )
    monkeypatch.setenv(
        "SUPABASE_PUBLISHABLE_KEY",
        "publishable-key",
    )

    class FakeResponse:
        def raise_for_status(self):
            request = httpx.Request(
                "POST",
                "https://example.supabase.co/rest/v1/rpc/"
                "trainer_assign_routine_template",
            )
            response = httpx.Response(
                409,
                request=request,
            )
            raise httpx.HTTPStatusError(
                "conflict",
                request=request,
                response=response,
            )

    class FakeClient:
        def __init__(self, timeout):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            pass

        async def post(self, url, headers, json):
            return FakeResponse()

    monkeypatch.setattr(
        repository.httpx,
        "AsyncClient",
        FakeClient,
    )

    try:
        asyncio.run(
            repository.assign_routine_template(
                _trainer(),
                athlete_id="athlete-1",
                template_id="template-1",
                routine_id="routine-1",
            )
        )
    except httpx.HTTPStatusError as exc:
        assert exc.response.status_code == 409
    else:
        raise AssertionError(
            "Expected duplicate routine conflict"
        )
