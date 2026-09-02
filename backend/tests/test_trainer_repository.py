import asyncio
import inspect

import httpx

from app.core.auth import AuthenticatedUser
from app.domains.trainer.models import TrainerAthlete
from app.domains.trainer import repository, service


def _trainer() -> AuthenticatedUser:
    return AuthenticatedUser(
        id="trainer-123",
        email="trainer@example.com",
        access_token="access-token",
        role="trainer",
    )


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
