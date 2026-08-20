from pydantic import BaseModel, Field

from app.domains.routines.profile_models import (
    TrainingProfileInput,
)


class GeneratedExercise(BaseModel):
    exercise_id: str
    name: str
    movement_pattern: str
    role: str

    record_type: str

    sets: int = Field(
        ge=1,
        le=10,
    )

    target: str

    target_rir: str | None = None

    rest_seconds: int = Field(
        ge=0,
        le=600,
    )


class GeneratedSession(BaseModel):
    session_id: str
    name: str
    focus: str

    exercises: list[GeneratedExercise]


class RoutineGenerationRequest(BaseModel):
    profile: TrainingProfileInput


class RoutineGenerationResult(BaseModel):
    structure_id: str
    structure_label: str

    sessions: list[GeneratedSession]

    warnings: list[str] = Field(
        default_factory=list
    )

    rationale: list[str] = Field(
        default_factory=list
    )