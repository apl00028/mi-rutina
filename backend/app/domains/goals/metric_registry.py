from dataclasses import dataclass

from app.domains.goals.models import (
    Goal,
    GoalMetricDataType,
    GoalMetricKey,
    GoalMetricUnit,
)


class InvalidGoalMetric(ValueError):
    pass


@dataclass(frozen=True)
class GoalMetricDefinition:
    unit: GoalMetricUnit
    data_type: GoalMetricDataType
    minimum: float
    maximum: float
    goal_kinds: frozenset[str]
    current_resolver: str | None = None


GOAL_METRICS: dict[
    GoalMetricKey,
    GoalMetricDefinition,
] = {
    "body_weight": GoalMetricDefinition(
        unit="kg",
        data_type="decimal",
        minimum=20,
        maximum=350,
        goal_kinds=frozenset({
            "general_health",
            "more_active",
            "fat_loss",
            "recomposition",
        }),
        current_resolver="latest_weight",
    ),
    "waist_circumference": GoalMetricDefinition(
        unit="cm",
        data_type="decimal",
        minimum=30,
        maximum=250,
        goal_kinds=frozenset({
            "fat_loss",
            "recomposition",
        }),
    ),
    "continuous_swim_distance": GoalMetricDefinition(
        unit="m",
        data_type="decimal",
        minimum=1,
        maximum=1_000_000,
        goal_kinds=frozenset({"swimming", "triathlon"}),
    ),
    "continuous_run_distance": GoalMetricDefinition(
        unit="m",
        data_type="decimal",
        minimum=1,
        maximum=1_000_000,
        goal_kinds=frozenset({
            "running",
            "triathlon",
            "duathlon",
        }),
    ),
    "cycling_distance": GoalMetricDefinition(
        unit="m",
        data_type="decimal",
        minimum=1,
        maximum=1_000_000,
        goal_kinds=frozenset({
            "cycling",
            "triathlon",
            "duathlon",
        }),
    ),
}


def metric_definition(
    metric_key: GoalMetricKey,
) -> GoalMetricDefinition:
    return GOAL_METRICS[metric_key]


def validate_metric_for_goal(
    goal: Goal,
    metric_key: GoalMetricKey,
) -> GoalMetricDefinition:
    definition = metric_definition(metric_key)
    if goal.kind not in definition.goal_kinds:
        raise InvalidGoalMetric(
            "Metric is not valid for this Goal"
        )
    return definition


def validate_metric_value(
    definition: GoalMetricDefinition,
    value: float | None,
) -> None:
    if value is None:
        return
    if not definition.minimum <= value <= definition.maximum:
        raise InvalidGoalMetric(
            "Metric value is outside the supported range"
        )
