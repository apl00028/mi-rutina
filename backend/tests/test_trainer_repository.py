import asyncio
import inspect

from app.core.auth import AuthenticatedUser
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
                }
            ]

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
        repository.list_active_trainer_athletes(
            _trainer()
        )
    )

    assert rows == [
        {
            "athlete_id": "athlete-1",
            "status": "active",
        }
    ]
    assert captured["timeout"] == 10.0
    assert captured["url"] == (
        "https://example.supabase.co/rest/v1/"
        "trainer_athletes"
    )
    assert captured["headers"] == {
        "Authorization": "Bearer access-token",
        "apikey": "publishable-key",
    }
    assert captured["params"] == {
        "trainer_id": "eq.trainer-123",
        "status": "eq.active",
        "select": "athlete_id,status",
        "order": "created_at.asc",
    }


def test_trainer_service_exposes_no_foreign_trainer_selector():
    signature = inspect.signature(
        service.list_authenticated_trainer_athletes
    )

    assert list(signature.parameters) == [
        "trainer"
    ]
