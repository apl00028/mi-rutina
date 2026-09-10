import asyncio

import httpx
from fastapi import FastAPI

from app.core.auth import AuthenticatedUser
from app.domains.goals import router as goals_api
from app.domains.goals.models import (
    CurrentMetricValue,
    GoalMetric,
    GoalMetricBaseline,
    GoalMetricState,
    GoalMetricValue,
)


USER_ID = "22222222-2222-4222-8222-222222222222"
GOAL_ID = "11111111-1111-4111-8111-111111111111"
METRIC_ID = "33333333-3333-4333-8333-333333333333"
BASE = f"/api/v1/goals/{GOAL_ID}"


def metric(**overrides) -> GoalMetric:
    return GoalMetric.model_validate({
        "id": METRIC_ID,
        "goal_id": GOAL_ID,
        "metric_key": "body_weight",
        "unit": "kg",
        "target_value": 80,
        "created_at": "2026-09-01T10:00:00Z",
        "updated_at": "2026-09-01T10:00:00Z",
        **overrides,
    })


def baseline() -> GoalMetricBaseline:
    return GoalMetricBaseline.model_validate({
        "id": "44444444-4444-4444-8444-444444444444",
        "goal_metric_id": METRIC_ID,
        "value": 91,
        "unit": "kg",
        "measured_at": "2026-09-01",
        "source_type": "manual",
        "source_domain": None,
        "source_record_id": None,
        "created_at": "2026-09-01T10:00:00Z",
        "updated_at": "2026-09-01T10:00:00Z",
    })


def request(method: str, path: str, json=None, role="user"):
    app = FastAPI()
    app.include_router(goals_api.router, prefix="/api/v1")

    async def actor():
        return AuthenticatedUser(
            id=USER_ID,
            role=role,
            access_token="token",
        )

    app.dependency_overrides[goals_api.require_user] = actor

    async def send():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            return await client.request(method, path, json=json)

    return asyncio.run(send())


def test_list_and_create_metric_contracts(monkeypatch):
    async def listing(*args):
        return []

    async def create(*args):
        assert args[2].metric_key == "body_weight"
        return metric()

    monkeypatch.setattr(
        goals_api.service,
        "list_user_goal_metrics",
        listing,
    )
    monkeypatch.setattr(
        goals_api.service,
        "create_user_goal_metric",
        create,
    )
    assert request("GET", f"{BASE}/metrics").json() == []
    response = request(
        "POST",
        f"{BASE}/metrics",
        {"metric_key": "body_weight", "target_value": 80},
    )
    assert response.status_code == 201
    assert response.json()["unit"] == "kg"


def test_invalid_metric_key_never_reaches_service(monkeypatch):
    called = False

    async def create(*args):
        nonlocal called
        called = True

    monkeypatch.setattr(
        goals_api.service,
        "create_user_goal_metric",
        create,
    )
    response = request(
        "POST",
        f"{BASE}/metrics",
        {"metric_key": "longest_run"},
    )
    assert response.status_code == 422
    assert called is False


def test_target_baseline_and_state_contracts(monkeypatch):
    async def update(*args):
        assert args[3].target_value is None
        return metric(target_value=None)

    async def put(*args):
        assert args[3].source_type == "manual"
        return baseline()

    async def states(*args):
        return [GoalMetricState(
            metric=metric(),
            baseline=baseline(),
            target=GoalMetricValue(value=80, unit="kg"),
            current=CurrentMetricValue(
                metric_key="body_weight",
                value=87,
                unit="kg",
                measured_at="2026-09-08",
                source={
                    "source_type": "scale",
                    "source_domain": "health_weight_entries",
                    "source_record_id": (
                        "55555555-5555-4555-8555-555555555555"
                    ),
                },
                available=True,
            ),
        )]

    monkeypatch.setattr(
        goals_api.service,
        "update_user_goal_metric_target",
        update,
    )
    monkeypatch.setattr(
        goals_api.service,
        "put_user_goal_metric_baseline",
        put,
    )
    monkeypatch.setattr(
        goals_api.service,
        "list_user_goal_metric_states",
        states,
    )
    target = request(
        "PATCH",
        f"{BASE}/metrics/{METRIC_ID}/target",
        {"target_value": None},
    )
    assert target.json()["target_value"] is None
    saved = request(
        "PUT",
        f"{BASE}/metrics/{METRIC_ID}/baseline",
        {
            "value": 91,
            "measured_at": "2026-09-01",
            "source_type": "manual",
        },
    )
    assert saved.json()["value"] == 91
    state = request("GET", f"{BASE}/metric-states").json()[0]
    assert state["baseline"]["value"] == 91
    assert state["current"]["value"] == 87
    assert state["target"]["value"] == 80


def test_missing_or_foreign_goal_is_not_exposed(monkeypatch):
    async def missing(*args):
        return None

    monkeypatch.setattr(
        goals_api.service,
        "list_user_goal_metrics",
        missing,
    )
    response = request("GET", f"{BASE}/metrics")
    assert response.status_code == 404


def test_trainer_cannot_access_metrics(monkeypatch):
    called = False

    async def listing(*args):
        nonlocal called
        called = True

    monkeypatch.setattr(
        goals_api.service,
        "list_user_goal_metrics",
        listing,
    )
    response = request(
        "GET",
        f"{BASE}/metrics",
        role="trainer",
    )
    assert response.status_code == 403
    assert called is False


def test_storage_error_is_safe(monkeypatch):
    async def broken(*args):
        raise RuntimeError("malformed upstream")

    monkeypatch.setattr(
        goals_api.service,
        "list_user_goal_metrics",
        broken,
    )
    response = request("GET", f"{BASE}/metrics")
    assert response.status_code == 502
    assert response.json() == {
        "detail": "Goal service is unavailable"
    }
