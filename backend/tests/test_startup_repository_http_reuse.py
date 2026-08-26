import asyncio

from app.core.auth import AuthenticatedUser
from app.domains.health_tracking import (
    repository as health_repository,
)
from app.domains.nutrition import (
    repository as nutrition_repository,
)
from app.domains.workouts import (
    repository as workouts_repository,
)


class FakeResponse:
    def raise_for_status(self):
        return None

    def json(self):
        return []


class SharedFakeClient:
    def __init__(self):
        self.calls = []

    async def get(
        self,
        url,
        headers,
        params,
    ):
        self.calls.append(
            {
                "url": url,
                "headers": dict(headers),
                "params": dict(params),
            }
        )
        return FakeResponse()


def test_home_startup_reads_reuse_shared_client(
    monkeypatch,
):
    user = AuthenticatedUser(
        id="user-123",
        access_token="token-123",
    )

    client = SharedFakeClient()

    repositories = [
        workouts_repository,
        nutrition_repository,
        health_repository,
    ]

    for repository in repositories:
        monkeypatch.setattr(
            repository,
            "_supabase_config",
            lambda: (
                "https://example.supabase.co",
                "publishable-key",
            ),
        )

        monkeypatch.setattr(
            repository,
            "get_supabase_http_client",
            lambda: client,
        )

    async def run():
        await asyncio.gather(
            workouts_repository.list_workouts(
                user
            ),
            nutrition_repository.list_nutrition_plans(
                user
            ),
            health_repository.list_weight_entries(
                user
            ),
        )

    asyncio.run(run())

    assert len(client.calls) == 3

    assert {
        call["headers"]["Authorization"]
        for call in client.calls
    } == {
        "Bearer token-123"
    }

    assert {
        call["url"]
        for call in client.calls
    } == {
        (
            "https://example.supabase.co"
            "/rest/v1/workouts"
        ),
        (
            "https://example.supabase.co"
            "/rest/v1/nutrition_plans"
        ),
        (
            "https://example.supabase.co"
            "/rest/v1/health_weight_entries"
        ),
    }
