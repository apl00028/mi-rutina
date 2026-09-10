import asyncio
import json

import httpx

from app.core.auth import AuthenticatedUser
from app.domains.goals import repository


USER_ID = "22222222-2222-4222-8222-222222222222"
GOAL_ID = "11111111-1111-4111-8111-111111111111"
METRIC_ID = "33333333-3333-4333-8333-333333333333"


def actor() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=USER_ID,
        role="user",
        access_token="user-token",
    )


def test_metric_mutations_scope_ids_and_never_accept_owner(
    monkeypatch,
):
    requests = []

    def handler(request):
        requests.append(request)
        payload = json.loads(request.content)
        return httpx.Response(200, json=[{
            "id": METRIC_ID,
            "goal_id": GOAL_ID,
            "metric_key": payload.get(
                "metric_key",
                "body_weight",
            ),
            "target_value": payload.get("target_value"),
            "created_at": "2026-09-01T10:00:00Z",
            "updated_at": "2026-09-01T10:00:00Z",
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
        await repository.create_goal_metric(
            actor(),
            GOAL_ID,
            {"metric_key": "body_weight", "target_value": 80},
        )
        await repository.update_goal_metric_target(
            actor(), GOAL_ID, METRIC_ID, None
        )
        await client.aclose()

    asyncio.run(run())
    created = json.loads(requests[0].content)
    assert created == {
        "goal_id": GOAL_ID,
        "metric_key": "body_weight",
        "target_value": 80,
    }
    assert requests[1].url.params["goal_id"] == f"eq.{GOAL_ID}"
    assert requests[1].url.params["id"] == f"eq.{METRIC_ID}"


def test_baseline_upsert_uses_metric_identity(monkeypatch):
    captured = []

    def handler(request):
        captured.append(request)
        payload = json.loads(request.content)
        return httpx.Response(200, json=[{
            "id": "44444444-4444-4444-8444-444444444444",
            **payload,
            "created_at": "2026-09-01T10:00:00Z",
            "updated_at": "2026-09-01T10:00:00Z",
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
        result = await repository.upsert_metric_baseline(
            actor(),
            METRIC_ID,
            {
                "value": 91,
                "measured_at": "2026-09-01",
                "source_type": "manual",
                "source_domain": None,
                "source_record_id": None,
            },
        )
        await client.aclose()
        return result

    result = asyncio.run(run())
    assert result["goal_metric_id"] == METRIC_ID
    assert captured[0].url.params["on_conflict"] \
        == "goal_metric_id"
    assert "resolution=merge-duplicates" in (
        captured[0].headers["prefer"]
    )
