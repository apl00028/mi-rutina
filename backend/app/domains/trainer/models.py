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


class TrainerAthleteHealth(BaseModel):
    weight_measurement_date: str | None = None
    waist_measurement_date: str | None = None
    weight_kg: float | None = None
    body_fat_percent: float | None = None
    muscle_mass_kg: float | None = None
    body_water_percent: float | None = None
    visceral_fat_index: float | None = None
    waist_cm: float | None = None


class TrainerAthleteLastWorkout(BaseModel):
    workout_id: str | None = None
    routine_id: str | None = None
    session_id: str | None = None
    session_name: str | None = None
    finished_at: str | None = None


class TrainerAthleteRecentTraining(BaseModel):
    last_completed: (
        TrainerAthleteLastWorkout | None
    ) = None
    completed_last_7_days: int = 0


class TrainerAthleteActiveRoutine(BaseModel):
    routine_id: str | None = None
    name: str | None = None
    activated_at: str | None = None


class TrainerAthleteActiveRoutines(BaseModel):
    strength: (
        TrainerAthleteActiveRoutine | None
    ) = None
    swimming: (
        TrainerAthleteActiveRoutine | None
    ) = None
    running: (
        TrainerAthleteActiveRoutine | None
    ) = None
    cycling: (
        TrainerAthleteActiveRoutine | None
    ) = None


class TrainerAthleteLastAssignment(BaseModel):
    template_id: str | None = None
    routine_id: str | None = None
    name: str | None = None
    discipline: RoutineDiscipline | None = None
    assigned_at: str | None = None


class TrainerAthleteTrainerInfo(BaseModel):
    last_assignment: (
        TrainerAthleteLastAssignment | None
    ) = None


class TrainerAthleteOverview(TrainerAthlete):
    health: TrainerAthleteHealth
    recent_training: TrainerAthleteRecentTraining
    active_routines: TrainerAthleteActiveRoutines
    trainer: TrainerAthleteTrainerInfo


class TrainerStrengthSet(BaseModel):
    set_index: int | None = None
    set_order: int
    set_type: str | None = None
    reps: int | None = None
    weight_kg: float | None = None
    rir: float | None = None
    rpe: float | None = None
    duration_seconds: int | None = None


class TrainerStrengthExercise(BaseModel):
    exercise_id: str
    exercise_name: str | None = None
    sets: list[TrainerStrengthSet] = Field(
        default_factory=list
    )


class TrainerStrengthSession(BaseModel):
    workout_id: str
    routine_id: str | None = None
    session_id: str | None = None
    session_name: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
    exercises: list[TrainerStrengthExercise] = Field(
        default_factory=list
    )


class TrainerPerformanceSession(BaseModel):
    id: str
    discipline: RoutineDiscipline
    title: str
    event_at: str
    finished_at: str | None = None
    started_at: str | None = None
    duration_seconds: float | None = None
    routine_id: str | None = None
    session_id: str | None = None
    source: str | None = None


class TrainerSwimmingLength(BaseModel):
    start_time: str | None = None
    duration_seconds: float | None = None
    distance_meters: float | None = None
    total_strokes: int | None = None
    average_stroke_rate_spm: float | None = None
    stroke: str | None = None
    length_type: str | None = None


class TrainerSwimmingSessionDetail(BaseModel):
    id: str
    discipline: Literal["swimming"]
    title: str
    event_at: str
    started_at: str
    duration_seconds: float | None = None
    total_distance_meters: float | None = None
    pool_length_meters: float | None = None
    total_elapsed_time_seconds: float | None = None
    total_timer_time_seconds: float | None = None
    total_moving_time_seconds: float | None = None
    average_pace_seconds_per_100m: float | None = None
    total_strokes: int | None = None
    heart_rate_average_bpm: int | None = None
    heart_rate_max_bpm: int | None = None
    total_calories: int | None = None
    aerobic_training_effect: float | None = None
    anaerobic_training_effect: float | None = None
    average_stroke_rate_spm: float | None = None
    average_speed_meters_per_second: float | None = None
    max_speed_meters_per_second: float | None = None
    objective: str | None = None
    technical_focus: list[str] = Field(
        default_factory=list
    )
    lengths: list[TrainerSwimmingLength] = Field(
        default_factory=list
    )


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
