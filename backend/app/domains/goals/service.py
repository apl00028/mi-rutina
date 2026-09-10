from app.core.auth import AuthenticatedUser
from pydantic import ValidationError

from app.domains.goals import repository
from app.domains.goals.models import (
    CurrentMetricSource,
    CurrentMetricValue,
    CurrentUnavailableReason,
    Goal,
    GoalCreate,
    GoalMetric,
    GoalMetricBaseline,
    GoalMetricBaselinePut,
    GoalMetricCreate,
    GoalMetricState,
    GoalMetricTargetUpdate,
    GoalMetricValue,
    GoalStatusUpdate,
    GoalUpdate,
    InvalidGoalTaxonomy,
    validate_goal_taxonomy,
)
from app.domains.goals.metric_registry import (
    InvalidGoalMetric,
    metric_definition,
    validate_metric_for_goal,
    validate_metric_value,
)
from app.domains.health_tracking.service import (
    list_user_weight_entries,
)


class GoalNotActiveError(ValueError):
    pass


def goal_metric_from_row(row: dict) -> GoalMetric:
    try:
        definition = metric_definition(row["metric_key"])
        return GoalMetric.model_validate({
            **row,
            "unit": definition.unit,
        })
    except (KeyError, ValidationError) as exc:
        raise RuntimeError(
            "Unexpected Supabase response."
        ) from exc


def baseline_from_row(
    row: dict,
    metric: GoalMetric,
) -> GoalMetricBaseline:
    try:
        return GoalMetricBaseline.model_validate({
            **row,
            "unit": metric.unit,
        })
    except ValidationError as exc:
        raise RuntimeError(
            "Unexpected Supabase response."
        ) from exc


def goal_from_row(row: dict) -> Goal:
    try:
        return Goal.model_validate(row)
    except ValidationError as exc:
        raise RuntimeError(
            "Unexpected Supabase response."
        ) from exc


async def get_user_active_goal(
    user: AuthenticatedUser,
) -> Goal | None:
    row = await repository.get_active_goal(user)
    return goal_from_row(row) if row else None


async def list_user_goals(
    user: AuthenticatedUser,
) -> list[Goal]:
    return [
        goal_from_row(row)
        for row in await repository.list_goals(user)
    ]


async def create_user_goal(
    user: AuthenticatedUser,
    request: GoalCreate,
) -> Goal:
    row = await repository.create_goal(
        user,
        request.model_dump(
            mode="json"
        ),
    )
    return goal_from_row(row)


async def update_user_goal(
    user: AuthenticatedUser,
    goal_id: str,
    request: GoalUpdate,
) -> Goal | None:
    current_row = await repository.get_goal(
        user,
        goal_id,
    )

    if current_row is None:
        return None

    current = goal_from_row(current_row)
    changes = request.model_dump(
        mode="json",
        exclude_unset=True,
    )

    validate_goal_taxonomy(
        changes.get("category", current.category),
        changes.get("kind", current.kind),
        changes.get("variant", current.variant),
    )

    row = await repository.update_goal(
        user,
        goal_id,
        changes,
    )
    return goal_from_row(row) if row else None


async def close_user_goal(
    user: AuthenticatedUser,
    goal_id: str,
    request: GoalStatusUpdate,
) -> Goal | None:
    current_row = await repository.get_goal(
        user,
        goal_id,
    )

    if current_row is None:
        return None

    if current_row.get("status") != "active":
        raise GoalNotActiveError(
            "Only an active Goal can be closed"
        )

    row = await repository.update_goal(
        user,
        goal_id,
        {"status": request.status},
        active_only=True,
    )

    if row is None:
        raise GoalNotActiveError(
            "Only an active Goal can be closed"
        )

    return goal_from_row(row)


async def _owned_goal(
    user: AuthenticatedUser,
    goal_id: str,
) -> Goal | None:
    row = await repository.get_goal(user, goal_id)
    return goal_from_row(row) if row else None


async def list_user_goal_metrics(
    user: AuthenticatedUser,
    goal_id: str,
) -> list[GoalMetric] | None:
    if await _owned_goal(user, goal_id) is None:
        return None
    return [
        goal_metric_from_row(row)
        for row in await repository.list_goal_metrics(
            user,
            goal_id,
        )
    ]


async def create_user_goal_metric(
    user: AuthenticatedUser,
    goal_id: str,
    request: GoalMetricCreate,
) -> GoalMetric | None:
    goal = await _owned_goal(user, goal_id)
    if goal is None:
        return None
    definition = validate_metric_for_goal(
        goal,
        request.metric_key,
    )
    validate_metric_value(
        definition,
        request.target_value,
    )
    row = await repository.create_goal_metric(
        user,
        goal_id,
        request.model_dump(mode="json"),
    )
    return goal_metric_from_row(row)


async def update_user_goal_metric_target(
    user: AuthenticatedUser,
    goal_id: str,
    metric_id: str,
    request: GoalMetricTargetUpdate,
) -> GoalMetric | None:
    if await _owned_goal(user, goal_id) is None:
        return None
    metric_row = await repository.get_goal_metric(
        user,
        goal_id,
        metric_id,
    )
    if metric_row is None:
        return None
    metric = goal_metric_from_row(metric_row)
    validate_metric_value(
        metric_definition(metric.metric_key),
        request.target_value,
    )
    row = await repository.update_goal_metric_target(
        user,
        goal_id,
        metric_id,
        request.target_value,
    )
    return goal_metric_from_row(row) if row else None


async def put_user_goal_metric_baseline(
    user: AuthenticatedUser,
    goal_id: str,
    metric_id: str,
    request: GoalMetricBaselinePut,
) -> GoalMetricBaseline | None:
    if await _owned_goal(user, goal_id) is None:
        return None
    metric_row = await repository.get_goal_metric(
        user,
        goal_id,
        metric_id,
    )
    if metric_row is None:
        return None
    metric = goal_metric_from_row(metric_row)
    validate_metric_value(
        metric_definition(metric.metric_key),
        request.value,
    )
    row = await repository.upsert_metric_baseline(
        user,
        metric_id,
        request.model_dump(mode="json"),
    )
    return baseline_from_row(row, metric)


def unavailable_current(
    metric: GoalMetric,
    reason: CurrentUnavailableReason = "no_reliable_resolver",
) -> CurrentMetricValue:
    return CurrentMetricValue.model_validate({
        "metric_key": metric.metric_key,
        "value": None,
        "unit": metric.unit,
        "available": False,
        "reason": reason,
    })


async def resolve_current(
    user: AuthenticatedUser,
    metric: GoalMetric,
    baseline: GoalMetricBaseline | None,
) -> CurrentMetricValue:
    definition = metric_definition(metric.metric_key)
    if definition.current_resolver != "latest_weight":
        return unavailable_current(metric)

    entries = await list_user_weight_entries(user)
    if not entries:
        return unavailable_current(metric, "no_measurement")

    latest = max(
        entries,
        key=lambda entry: (
            entry.measurementDate,
            str(entry.id),
        ),
    )
    if (
        baseline is not None
        and latest.measurementDate < baseline.measured_at
    ):
        return unavailable_current(
            metric,
            "no_measurement_after_baseline",
        )

    return CurrentMetricValue(
        metric_key=metric.metric_key,
        value=latest.weightKg,
        unit=metric.unit,
        measured_at=latest.measurementDate,
        source=CurrentMetricSource(
            source_type=latest.source,
            source_domain="health_weight_entries",
            source_record_id=str(latest.id),
        ),
        available=True,
    )


async def list_user_goal_metric_states(
    user: AuthenticatedUser,
    goal_id: str,
) -> list[GoalMetricState] | None:
    metrics = await list_user_goal_metrics(user, goal_id)
    if metrics is None:
        return None
    baseline_rows = await repository.list_metric_baselines(
        user,
        [str(metric.id) for metric in metrics],
    )
    baselines_by_metric = {
        str(row["goal_metric_id"]): row
        for row in baseline_rows
    }
    states: list[GoalMetricState] = []
    for metric in metrics:
        baseline_row = baselines_by_metric.get(str(metric.id))
        baseline = (
            baseline_from_row(baseline_row, metric)
            if baseline_row
            else None
        )
        target = (
            GoalMetricValue(
                value=metric.target_value,
                unit=metric.unit,
            )
            if metric.target_value is not None
            else None
        )
        states.append(GoalMetricState(
            metric=metric,
            baseline=baseline,
            target=target,
            current=await resolve_current(
                user,
                metric,
                baseline,
            ),
        ))
    return states
