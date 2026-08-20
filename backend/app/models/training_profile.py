from typing import Literal

from pydantic import BaseModel, Field


PrimaryGoal = Literal[
    "muscle_gain",
    "strength_gain",
    "return_to_training",
    "maintenance",
    "general_health",
    "fat_loss",
]

ExperienceLevel = Literal[
    "beginner",
    "returning",
    "intermediate",
    "advanced",
]

TrainingLocation = Literal[
    "commercial_gym",
    "limited_gym",
    "home",
]

Sex = Literal[
    "male",
    "female",
    "prefer_not_to_say",
]

Motivation = Literal[
    "physique",
    "muscle",
    "strength",
    "fat_loss",
    "health",
    "energy",
    "sports_performance",
    "consistency",
    "stress_relief",
    "other",
]


class TrainingProfileInput(BaseModel):
    display_name: str | None = Field(
        default=None,
        min_length=1,
        max_length=50,
    )

    age: int | None = Field(
        default=None,
        ge=14,
        le=100,
    )

    sex: Sex | None = None

    height_cm: int | None = Field(
        default=None,
        ge=120,
        le=230,
    )

    weight_kg: float | None = Field(
        default=None,
        ge=30,
        le=300,
    )

    motivations: list[Motivation] = Field(
        default_factory=list,
        max_length=2,
    )

    primary_goal: PrimaryGoal

    experience_level: ExperienceLevel

    weekly_availability: int = Field(
        ge=2,
        le=6,
    )

    session_duration_min: int = Field(
        ge=25,
        le=180,
    )

    training_location: TrainingLocation

    available_equipment: list[str] = Field(
        default_factory=list
    )

    injuries: list[str] = Field(
        default_factory=list
    )

    pain_areas: list[str] = Field(
        default_factory=list
    )

    avoided_exercise_ids: list[str] = Field(
        default_factory=list
    )

    preferred_exercise_ids: list[str] = Field(
    default_factory=list
    )


class TrainingProfile(TrainingProfileInput):
    user_id: str

    onboarding_completed: bool = False