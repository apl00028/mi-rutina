import asyncio
import json

import httpx
import pytest

from app.core.auth import AuthenticatedUser
from app.domains.goals import repository


USER_ID = "22222222-2222-4222-8222-222222222222"
OTHER_GOAL = "11111111-1111-4111-8111-111111111111"


def user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=USER_ID,
        role="user",
        access_token="user-token",
    )


def test_reads_are_always_scoped_to_authenticated_owner(
    monkeypatch,
):
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(200, json=[])

    client = httpx.AsyncClient(
        transport=httpx.MockTransport(handler)
    )
    monkeypatch.setattr(
        repository,
        "get_supabase_http_client",
        lambda: client,
    )
    monkeypatch.setattr(
        repository,
        "_supabase_config",
        lambda: ("https://supabase.test", "key"),
    )

    async def run():
        await repository.get_active_goal(user())
        await repository.list_goals(user())
        await repository.get_goal(
            user(),
            OTHER_GOAL,
        )
        await client.aclose()

    asyncio.run(run())

    assert len(requests) == 3
    assert all(
        request.url.params["user_id"]
        == f"eq.{USER_ID}"
        for request in requests
    )
    assert requests[2].url.params["id"] \
        == f"eq.{OTHER_GOAL}"


def test_create_derives_owner_creator_and_status(
    monkeypatch,
):
    captured = []

    def handler(request):
        payload = json.loads(request.content)
        captured.append(payload)
        return httpx.Response(200, json=[{
            "id": OTHER_GOAL,
            **payload,
            "created_at": "2026-09-09T10:00:00Z",
            "updated_at": "2026-09-09T10:00:00Z",
        }])

    client = httpx.AsyncClient(
        transport=httpx.MockTransport(handler)
    )
    monkeypatch.setattr(
        repository,
        "get_supabase_http_client",
        lambda: client,
    )
    monkeypatch.setattr(
        repository,
        "_supabase_config",
        lambda: ("https://supabase.test", "key"),
    )

    async def run():
        result = await repository.create_goal(
            user(),
            {
                "category": "health",
                "kind": "more_active",
                "variant": None,
                "target_date": None,
            },
        )
        await client.aclose()
        return result

    result = asyncio.run(run())
    assert result["user_id"] == USER_ID
    assert captured[0]["user_id"] == USER_ID
    assert captured[0]["created_by_user_id"] \
        == USER_ID
    assert captured[0]["status"] == "active"


def test_invalid_storage_response_is_rejected(
    monkeypatch,
):
    def handler(request):
        return httpx.Response(
            200,
            content=b"not-json",
        )

    client = httpx.AsyncClient(
        transport=httpx.MockTransport(handler)
    )
    monkeypatch.setattr(
        repository,
        "get_supabase_http_client",
        lambda: client,
    )
    monkeypatch.setattr(
        repository,
        "_supabase_config",
        lambda: ("https://supabase.test", "key"),
    )

    async def run():
        try:
            await repository.list_goals(user())
        finally:
            await client.aclose()

    with pytest.raises(
        RuntimeError,
        match="Unexpected Supabase response",
    ):
        asyncio.run(run())
