from datetime import datetime
from typing import Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)


RoutineDiscipline = Literal[
    "strength",
    "swimming",
    "cycling",
    "running",
]


class TrainerAthlete(BaseModel):
    athlete_id: str
    status: Literal[
        "active",
        "inactive",
    ]
    email: str | None = None
    display_name: str | None = None
    client_since: datetime


class RoutineTemplateCreate(BaseModel):
    model_config = ConfigDict(
        extra="forbid"
    )

    id: str
    name: str
    discipline: RoutineDiscipline
    data: dict[str, Any] = Field(
        default_factory=dict
    )

    @field_validator("id", "name")
    @classmethod
    def validate_trimmed_non_empty(
        cls,
        value: str,
    ) -> str:
        if value != value.strip() or not value:
            raise ValueError(
                "value must be trimmed and non-empty"
            )

        return value


class RoutineTemplateUpdate(BaseModel):
    model_config = ConfigDict(
        extra="forbid"
    )

    name: str
    discipline: RoutineDiscipline
    data: dict[str, Any] = Field(
        default_factory=dict
    )

    @field_validator("name")
    @classmethod
    def validate_trimmed_non_empty(
        cls,
        value: str,
    ) -> str:
        if value != value.strip() or not value:
            raise ValueError(
                "value must be trimmed and non-empty"
            )

        return value


class RoutineTemplate(BaseModel):
    id: str
    name: str
    discipline: RoutineDiscipline
    data: dict[str, Any]
    created_at: str
    updated_at: str


class TemplateAssignmentCreate(BaseModel):
    model_config = ConfigDict(
        extra="forbid"
    )

    athlete_id: str
    routine_id: str

    @field_validator("athlete_id", "routine_id")
    @classmethod
    def validate_trimmed_non_empty(
        cls,
        value: str,
    ) -> str:
        if value != value.strip() or not value:
            raise ValueError(
                "value must be trimmed and non-empty"
            )

        return value


class TemplateAssignment(BaseModel):
    assignment_id: str
    athlete_id: str
    template_id: str
    routine_id: str
    discipline: RoutineDiscipline
    assigned_at: str
