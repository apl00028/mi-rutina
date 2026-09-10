import asyncio

import httpx
from fastapi import FastAPI

from app.core.auth import AuthenticatedUser
from app.domains.goals import router as goals_api
from app.domains.goals.models import Goal


GOAL_ID = "11111111-1111-4111-8111-111111111111"
USER_ID = "22222222-2222-4222-8222-222222222222"
BASE = "/api/v1/goals"


def row(**overrides):
    return {
        "id": GOAL_ID,
        "user_id": USER_ID,
        "category": "endurance",
        "kind": "running",
        "variant": "10k",
        "target_date": "2027-04-18",
        "status": "active",
        "created_by_user_id": USER_ID,
        "created_at": "2026-09-09T10:00:00Z",
        "updated_at": "2026-09-09T10:00:00Z",
        **overrides,
    }


def goal(**overrides) -> Goal:
    return Goal.model_validate(row(**overrides))


def request(
    method: str,
    path: str,
    *,
    json=None,
    role: str = "user",
):
    app = FastAPI()
    app.include_router(
        goals_api.router,
        prefix="/api/v1",
    )

    async def actor():
        return AuthenticatedUser(
            id=USER_ID,
            role=role,
            access_token="token",
        )

    app.dependency_overrides[
        goals_api.require_user
    ] = actor

    async def send():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            return await client.request(
                method,
                path,
                json=json,
            )

    return asyncio.run(send())


def test_create_goal_contract(monkeypatch):
    captured = []

    async def create(actor, body):
        captured.append((actor, body))
        return goal()

    monkeypatch.setattr(
        goals_api.service,
        "create_user_goal",
        create,
    )
    response = request(
        "POST",
        BASE,
        json={
            "category": "endurance",
            "kind": "running",
            "variant": "10k",
            "target_date": "2027-04-18",
        },
    )
    assert response.status_code == 201
    assert response.json() == row()
    assert captured[0][0].id == USER_ID


def test_get_active_and_empty_contract(monkeypatch):
    result = goal()

    async def active(actor):
        return result

    monkeypatch.setattr(
        goals_api.service,
        "get_user_active_goal",
        active,
    )
    assert request("GET", f"{BASE}/active").json() \
        == row()

    async def empty(actor):
        return None

    monkeypatch.setattr(
        goals_api.service,
        "get_user_active_goal",
        empty,
    )
    response = request("GET", f"{BASE}/active")
    assert response.status_code == 200
    assert response.json() is None


def test_get_active_storage_failure_is_not_reported_as_empty(
    monkeypatch,
):
    upstream_request = httpx.Request(
        "GET",
        "https://supabase.test/rest/v1/goals",
    )
    upstream_response = httpx.Response(
        404,
        request=upstream_request,
    )

    async def unavailable(actor):
        raise httpx.HTTPStatusError(
            "goals table is unavailable",
            request=upstream_request,
            response=upstream_response,
        )

    monkeypatch.setattr(
        goals_api.service,
        "get_user_active_goal",
        unavailable,
    )
    response = request("GET", f"{BASE}/active")
    assert response.status_code == 502
    assert response.json() == {
        "detail": "Goal service is unavailable"
    }


def test_list_history_contract(monkeypatch):
    async def history(actor):
        return [
            goal(status="completed"),
            goal(
                id="33333333-3333-4333-8333-333333333333",
                status="abandoned",
            ),
        ]

    monkeypatch.setattr(
        goals_api.service,
        "list_user_goals",
        history,
    )
    response = request("GET", BASE)
    assert response.status_code == 200
    assert [item["status"] for item in response.json()] \
        == ["completed", "abandoned"]


def test_invalid_taxonomy_never_reaches_service(
    monkeypatch,
):
    called = False

    async def create(actor, body):
        nonlocal called
        called = True

    monkeypatch.setattr(
        goals_api.service,
        "create_user_goal",
        create,
    )
    invalid_kind = request(
        "POST",
        BASE,
        json={
            "category": "health",
            "kind": "triathlon",
        },
    )
    invalid_variant = request(
        "POST",
        BASE,
        json={
            "category": "endurance",
            "kind": "running",
            "variant": "olympic",
        },
    )
    assert invalid_kind.status_code == 422
    assert invalid_variant.status_code == 422
    assert called is False


def test_update_and_status_contracts(monkeypatch):
    calls = []

    async def update(actor, goal_id, body):
        calls.append(("update", goal_id, body))
        return goal(target_date=None)

    async def close(actor, goal_id, body):
        calls.append(("status", goal_id, body))
        return goal(status=body.status)

    monkeypatch.setattr(
        goals_api.service,
        "update_user_goal",
        update,
    )
    monkeypatch.setattr(
        goals_api.service,
        "close_user_goal",
        close,
    )

    updated = request(
        "PATCH",
        f"{BASE}/{GOAL_ID}",
        json={"target_date": None},
    )
    completed = request(
        "PATCH",
        f"{BASE}/{GOAL_ID}/status",
        json={"status": "completed"},
    )
    assert updated.status_code == 200
    assert updated.json()["target_date"] is None
    assert completed.json()["status"] == "completed"
    assert calls[0][2].model_fields_set \
        == {"target_date"}


def test_second_active_goal_conflict_is_clear(monkeypatch):
    request_with_error = httpx.Request(
        "POST",
        "https://supabase.test/rest/v1/goals",
    )
    response_with_error = httpx.Response(
        409,
        request=request_with_error,
    )

    async def conflict(actor, body):
        raise httpx.HTTPStatusError(
            "duplicate",
            request=request_with_error,
            response=response_with_error,
        )

    monkeypatch.setattr(
        goals_api.service,
        "create_user_goal",
        conflict,
    )
    response = request(
        "POST",
        BASE,
        json={
            "category": "health",
            "kind": "more_active",
        },
    )
    assert response.status_code == 409
    assert response.json() == {
        "detail": "An active Goal already exists"
    }


def test_trainer_cannot_operate_athlete_goals(
    monkeypatch,
):
    called = False

    async def active(actor):
        nonlocal called
        called = True

    monkeypatch.setattr(
        goals_api.service,
        "get_user_active_goal",
        active,
    )
    response = request(
        "GET",
        f"{BASE}/active",
        role="trainer",
    )
    assert response.status_code == 403
    assert called is False


def test_other_users_goal_is_not_exposed_or_modified(
    monkeypatch,
):
    async def missing(*args):
        return None

    monkeypatch.setattr(
        goals_api.service,
        "update_user_goal",
        missing,
    )
    response = request(
        "PATCH",
        f"{BASE}/{GOAL_ID}",
        json={"target_date": None},
    )
    assert response.status_code == 404
    assert response.json() == {
        "detail": "Goal not found"
    }
