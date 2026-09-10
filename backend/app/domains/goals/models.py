from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)


GoalCategory = Literal[
    "health",
    "body_composition",
    "strength",
    "endurance",
    "sport_performance",
]

GoalKind = Literal[
    "general_health",
    "more_active",
    "fat_loss",
    "recomposition",
    "muscle_gain",
    "strength_gain",
    "return_to_training",
    "running",
    "swimming",
    "cycling",
    "triathlon",
    "duathlon",
    "sport_performance",
]

GoalVariant = Literal[
    "5k",
    "10k",
    "half_marathon",
    "sprint",
    "olympic",
]

GoalStatus = Literal[
    "active",
    "completed",
    "abandoned",
]

GoalClosingStatus = Literal[
    "completed",
    "abandoned",
]


GOAL_KINDS_BY_CATEGORY: dict[
    GoalCategory,
    frozenset[GoalKind],
] = {
    "health": frozenset({
        "general_health",
        "more_active",
    }),
    "body_composition": frozenset({
        "fat_loss",
        "recomposition",
    }),
    "strength": frozenset({
        "muscle_gain",
        "strength_gain",
        "return_to_training",
    }),
    "endurance": frozenset({
        "running",
        "swimming",
        "cycling",
        "triathlon",
        "duathlon",
    }),
    "sport_performance": frozenset({
        "sport_performance",
    }),
}

GOAL_VARIANTS_BY_KIND: dict[
    GoalKind,
    frozenset[GoalVariant],
] = {
    "running": frozenset({
        "5k",
        "10k",
        "half_marathon",
    }),
    "triathlon": frozenset({
        "sprint",
        "olympic",
    }),
}


class InvalidGoalTaxonomy(ValueError):
    pass


def validate_goal_taxonomy(
    category: GoalCategory,
    kind: GoalKind,
    variant: GoalVariant | None,
) -> None:
    if kind not in GOAL_KINDS_BY_CATEGORY[
        category
    ]:
        raise InvalidGoalTaxonomy(
            "Goal kind is not valid for its category"
        )

    if variant is None:
        return

    allowed_variants = (
        GOAL_VARIANTS_BY_KIND.get(kind)
    )

    if (
        allowed_variants is None
        or variant not in allowed_variants
    ):
        raise InvalidGoalTaxonomy(
            "Goal variant is not valid for its kind"
        )


class GoalTaxonomy(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )

    category: GoalCategory
    kind: GoalKind
    variant: GoalVariant | None = None

    @model_validator(mode="after")
    def validate_taxonomy(self) -> "GoalTaxonomy":
        validate_goal_taxonomy(
            self.category,
            self.kind,
            self.variant,
        )
        return self


class GoalCreate(GoalTaxonomy):
    target_date: date | None = None


class GoalUpdate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )

    category: GoalCategory | None = None
    kind: GoalKind | None = None
    variant: GoalVariant | None = None
    target_date: date | None = None

    @model_validator(mode="after")
    def validate_update(self) -> "GoalUpdate":
        if not self.model_fields_set:
            raise ValueError(
                "At least one Goal field is required"
            )

        for required_field in (
            "category",
            "kind",
        ):
            if (
                required_field in self.model_fields_set
                and getattr(self, required_field) is None
            ):
                raise ValueError(
                    f"{required_field} cannot be null"
                )

        return self


class GoalStatusUpdate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )

    status: GoalClosingStatus


class Goal(GoalTaxonomy):
    model_config = ConfigDict(
        extra="ignore",
        strict=False,
    )

    id: UUID
    user_id: UUID
    target_date: date | None = None
    status: GoalStatus
    created_by_user_id: UUID | None
    created_at: AwareDatetime
    updated_at: AwareDatetime


GoalMetricKey = Literal[
    "body_weight",
    "waist_circumference",
    "continuous_swim_distance",
    "continuous_run_distance",
    "cycling_distance",
]

GoalMetricUnit = Literal["kg", "cm", "m"]
GoalMetricDataType = Literal["decimal"]
GoalMetricSourceType = Literal[
    "manual",
    "aptus",
    "health_connect",
    "imported",
    "derived",
    "scale",
]
GoalMetricSourceDomain = Literal[
    "health_weight_entries",
    "health_body_measurements",
    "health_weekly_checkins",
    "running_sessions",
    "swimming_sessions",
    "workouts",
]
CurrentUnavailableReason = Literal[
    "no_reliable_resolver",
    "no_measurement",
    "no_measurement_after_baseline",
]


class GoalMetricCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    metric_key: GoalMetricKey
    target_value: float | None = None


class GoalMetricTargetUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_value: float | None


class GoalMetricBaselinePut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: float
    measured_at: date
    source_type: GoalMetricSourceType
    source_domain: GoalMetricSourceDomain | None = None
    source_record_id: str | None = Field(
        default=None,
        min_length=1,
        max_length=1024,
        pattern=r".*\S.*",
    )

    @model_validator(mode="after")
    def validate_source_reference(
        self,
    ) -> "GoalMetricBaselinePut":
        if (
            self.source_record_id is not None
            and self.source_domain is None
        ):
            raise ValueError(
                "source_domain is required with source_record_id"
            )
        return self


class GoalMetric(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        strict=False,
    )

    id: UUID
    goal_id: UUID
    metric_key: GoalMetricKey
    unit: GoalMetricUnit
    target_value: float | None
    created_at: AwareDatetime
    updated_at: AwareDatetime


class GoalMetricBaseline(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        strict=False,
    )

    id: UUID
    goal_metric_id: UUID
    value: float
    unit: GoalMetricUnit
    measured_at: date
    source_type: GoalMetricSourceType
    source_domain: str | None
    source_record_id: str | None
    created_at: AwareDatetime
    updated_at: AwareDatetime


class GoalMetricValue(BaseModel):
    value: float
    unit: GoalMetricUnit


class CurrentMetricSource(BaseModel):
    source_type: GoalMetricSourceType
    source_domain: GoalMetricSourceDomain
    source_record_id: str | None = None


class CurrentMetricValue(BaseModel):
    metric_key: GoalMetricKey
    value: float | None
    unit: GoalMetricUnit
    measured_at: date | None = None
    source: CurrentMetricSource | None = None
    available: bool
    reason: CurrentUnavailableReason | None = None

    @model_validator(mode="after")
    def validate_availability(self) -> "CurrentMetricValue":
        facts = (
            self.value,
            self.measured_at,
            self.source,
        )
        if self.available:
            if any(fact is None for fact in facts) or self.reason:
                raise ValueError(
                    "Available Current requires value, date and source"
                )
        elif any(fact is not None for fact in facts) or not self.reason:
            raise ValueError(
                "Unavailable Current requires a reason and no value"
            )
        return self


class GoalMetricState(BaseModel):
    metric: GoalMetric
    baseline: GoalMetricBaseline | None
    target: GoalMetricValue | None
    current: CurrentMetricValue
