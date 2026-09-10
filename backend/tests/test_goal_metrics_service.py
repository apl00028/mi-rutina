import asyncio

import pytest

from app.core.auth import AuthenticatedUser
from app.domains.goals import repository, service
from app.domains.goals.metric_registry import (
    InvalidGoalMetric,
    metric_definition,
    validate_metric_for_goal,
)
from app.domains.goals.models import (
    Goal,
    GoalMetricBaselinePut,
    GoalMetricCreate,
    GoalMetricTargetUpdate,
)
from app.domains.health_tracking.models import WeightEntry


USER_ID = "22222222-2222-4222-8222-222222222222"
GOAL_ID = "11111111-1111-4111-8111-111111111111"
METRIC_ID = "33333333-3333-4333-8333-333333333333"
BASELINE_ID = "44444444-4444-4444-8444-444444444444"


def actor() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=USER_ID,
        role="user",
        access_token="token",
    )


def goal_row(**overrides):
    return {
        "id": GOAL_ID,
        "user_id": USER_ID,
        "category": "body_composition",
        "kind": "fat_loss",
        "variant": None,
        "target_date": None,
        "status": "active",
        "created_by_user_id": USER_ID,
        "created_at": "2026-09-01T10:00:00Z",
        "updated_at": "2026-09-01T10:00:00Z",
        **overrides,
    }


def metric_row(**overrides):
    return {
        "id": METRIC_ID,
        "goal_id": GOAL_ID,
        "metric_key": "body_weight",
        "target_value": None,
        "created_at": "2026-09-01T10:00:00Z",
        "updated_at": "2026-09-01T10:00:00Z",
        **overrides,
    }


def baseline_row(**overrides):
    return {
        "id": BASELINE_ID,
        "goal_metric_id": METRIC_ID,
        "value": 91,
        "measured_at": "2026-09-01",
        "source_type": "manual",
        "source_domain": None,
        "source_record_id": None,
        "created_at": "2026-09-01T10:00:00Z",
        "updated_at": "2026-09-01T10:00:00Z",
        **overrides,
    }


def weight(entry_id: str, day: str, value: float):
    return WeightEntry.model_validate({
        "id": entry_id,
        "measurementDate": day,
        "weightKg": value,
        "source": "scale",
    })


def test_registry_defines_canonical_units_and_goal_scope():
    assert metric_definition("body_weight").unit == "kg"
    assert metric_definition("waist_circumference").unit == "cm"
    assert metric_definition("continuous_run_distance").unit == "m"
    running = Goal.model_validate(goal_row(
        category="endurance",
        kind="running",
    ))
    assert validate_metric_for_goal(
        running,
        "continuous_run_distance",
    ).data_type == "decimal"
    with pytest.raises(InvalidGoalMetric):
        validate_metric_for_goal(running, "body_weight")


def test_create_metric_validates_and_derives_unit(monkeypatch):
    captured = {}

    async def get_goal(*args):
        return goal_row()

    async def create(*args):
        captured.update(args[2])
        return metric_row(target_value=80)

    monkeypatch.setattr(repository, "get_goal", get_goal)
    monkeypatch.setattr(repository, "create_goal_metric", create)
    result = asyncio.run(service.create_user_goal_metric(
        actor(),
        GOAL_ID,
        GoalMetricCreate(
            metric_key="body_weight",
            target_value=80,
        ),
    ))
    assert result is not None
    assert result.unit == "kg"
    assert captured == {
        "metric_key": "body_weight",
        "target_value": 80.0,
    }


def test_target_is_nullable_editable_and_bounded(monkeypatch):
    async def get_goal(*args):
        return goal_row()

    async def get_metric(*args):
        return metric_row(target_value=80)

    async def update(*args):
        return metric_row(target_value=args[3])

    monkeypatch.setattr(repository, "get_goal", get_goal)
    monkeypatch.setattr(repository, "get_goal_metric", get_metric)
    monkeypatch.setattr(
        repository,
        "update_goal_metric_target",
        update,
    )
    result = asyncio.run(
        service.update_user_goal_metric_target(
            actor(),
            GOAL_ID,
            METRIC_ID,
            GoalMetricTargetUpdate(target_value=None),
        )
    )
    assert result is not None
    assert result.target_value is None

    with pytest.raises(InvalidGoalMetric):
        asyncio.run(service.update_user_goal_metric_target(
            actor(),
            GOAL_ID,
            METRIC_ID,
            GoalMetricTargetUpdate(target_value=500),
        ))


def test_manual_baseline_and_provenance_are_snapshotted(monkeypatch):
    captured = {}

    async def get_goal(*args):
        return goal_row()

    async def get_metric(*args):
        return metric_row()

    async def upsert(*args):
        captured.update(args[2])
        return baseline_row(**args[2])

    monkeypatch.setattr(repository, "get_goal", get_goal)
    monkeypatch.setattr(repository, "get_goal_metric", get_metric)
    monkeypatch.setattr(
        repository,
        "upsert_metric_baseline",
        upsert,
    )
    result = asyncio.run(service.put_user_goal_metric_baseline(
        actor(),
        GOAL_ID,
        METRIC_ID,
        GoalMetricBaselinePut(
            value=91,
            measured_at="2026-09-01",
            source_type="manual",
        ),
    ))
    assert result is not None
    assert result.value == 91
    assert result.source_type == "manual"
    assert captured["measured_at"] == "2026-09-01"


def test_goal_without_metrics_and_unresolved_metric(monkeypatch):
    async def get_goal(*args):
        return goal_row()

    async def no_metrics(*args):
        return []

    monkeypatch.setattr(repository, "get_goal", get_goal)
    monkeypatch.setattr(repository, "list_goal_metrics", no_metrics)
    monkeypatch.setattr(
        repository,
        "list_metric_baselines",
        no_metrics,
    )
    assert asyncio.run(service.list_user_goal_metric_states(
        actor(), GOAL_ID
    )) == []

    metric = service.goal_metric_from_row(metric_row(
        metric_key="waist_circumference"
    ))
    current = asyncio.run(service.resolve_current(
        actor(), metric, None
    ))
    assert current.available is False
    assert current.reason == "no_reliable_resolver"


def test_weight_current_selects_latest_and_keeps_provenance(
    monkeypatch,
):
    metric = service.goal_metric_from_row(metric_row())

    async def entries(*args):
        return [
            weight(
                "55555555-5555-4555-8555-555555555555",
                "2026-09-03",
                89,
            ),
            weight(
                "66666666-6666-4666-8666-666666666666",
                "2026-09-08",
                87,
            ),
        ]

    monkeypatch.setattr(service, "list_user_weight_entries", entries)
    current = asyncio.run(service.resolve_current(
        actor(), metric, None
    ))
    assert current.available is True
    assert current.value == 87
    assert current.measured_at.isoformat() == "2026-09-08"
    assert current.source is not None
    assert current.source.source_type == "scale"
    assert current.source.source_domain == "health_weight_entries"


def test_weight_before_baseline_is_not_current(monkeypatch):
    metric = service.goal_metric_from_row(metric_row())
    baseline = service.baseline_from_row(
        baseline_row(measured_at="2026-09-10"),
        metric,
    )

    async def entries(*args):
        return [weight(
            "55555555-5555-4555-8555-555555555555",
            "2026-09-08",
            89,
        )]

    monkeypatch.setattr(service, "list_user_weight_entries", entries)
    current = asyncio.run(service.resolve_current(
        actor(), metric, baseline
    ))
    assert current.available is False
    assert current.reason == "no_measurement_after_baseline"


def test_baseline_current_and_target_are_independent(monkeypatch):
    async def get_goal(*args):
        return goal_row()

    async def metrics(*args):
        return [metric_row(target_value=84)]

    async def baselines(*args):
        return [baseline_row(value=91)]

    async def entries(*args):
        return [weight(
            "55555555-5555-4555-8555-555555555555",
            "2026-09-08",
            87,
        )]

    monkeypatch.setattr(repository, "get_goal", get_goal)
    monkeypatch.setattr(repository, "list_goal_metrics", metrics)
    monkeypatch.setattr(repository, "list_metric_baselines", baselines)
    monkeypatch.setattr(service, "list_user_weight_entries", entries)
    state = asyncio.run(service.list_user_goal_metric_states(
        actor(), GOAL_ID
    ))[0]
    assert state.baseline is not None
    assert state.baseline.value == 91
    assert state.current.value == 87
    assert state.target is not None
    assert state.target.value == 84

    async def newer_entries(*args):
        return [weight(
            "66666666-6666-4666-8666-666666666666",
            "2026-09-09",
            86,
        )]

    monkeypatch.setattr(
        service,
        "list_user_weight_entries",
        newer_entries,
    )
    state = asyncio.run(service.list_user_goal_metric_states(
        actor(), GOAL_ID
    ))[0]
    assert state.baseline.value == 91
    assert state.current.value == 86


def test_baseline_only_and_target_only_states(monkeypatch):
    waist_id = "77777777-7777-4777-8777-777777777777"

    async def get_goal(*args):
        return goal_row()

    async def metrics(*args):
        return [
            metric_row(target_value=None),
            metric_row(
                id=waist_id,
                metric_key="waist_circumference",
                target_value=84,
            ),
        ]

    async def baselines(*args):
        return [baseline_row(value=91)]

    async def entries(*args):
        return []

    monkeypatch.setattr(repository, "get_goal", get_goal)
    monkeypatch.setattr(repository, "list_goal_metrics", metrics)
    monkeypatch.setattr(repository, "list_metric_baselines", baselines)
    monkeypatch.setattr(service, "list_user_weight_entries", entries)
    states = asyncio.run(service.list_user_goal_metric_states(
        actor(), GOAL_ID
    ))
    assert states[0].baseline is not None
    assert states[0].target is None
    assert states[1].baseline is None
    assert states[1].target is not None
    assert states[1].current.reason == "no_reliable_resolver"
