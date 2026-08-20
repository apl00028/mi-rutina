from typing import Literal

from pydantic import BaseModel, Field


MovementPattern = Literal[
    "squat",
    "knee_dominant",
    "hip_hinge",
    "horizontal_push",
    "vertical_push",
    "horizontal_pull",
    "vertical_pull",
    "hip_extension",
    "knee_flexion",
    "knee_extension",
    "calf_raise",
    "elbow_flexion",
    "elbow_extension",
    "shoulder_abduction",
    "shoulder_flexion",
    "shoulder_external_rotation",
    "hip_abduction",
    "hip_adduction",
    "anti_extension_core",
    "anti_rotation_core",
    "lateral_core",
    "trunk_flexion",
    "hip_flexion_core",
    "loaded_carry",
    "unilateral_lower_body",
    "locomotion",
    "spinal_mobility",
    "thoracic_rotation",
    "hip_flexor_mobility",
]


class ExerciseDomainMetadata(BaseModel):
    movement_pattern: MovementPattern

    required_equipment: list[str] = Field(
        default_factory=list
    )

    difficulty: str | None = None

    technical_complexity: int = Field(
        default=1,
        ge=1,
        le=5,
    )

    stability_demand: int = Field(
        default=1,
        ge=1,
        le=5,
    )

    balance_demand: int = Field(
        default=1,
        ge=1,
        le=5,
    )

    supported: bool = False

    unilateral: bool = False

    body_positions: list[str] = Field(
        default_factory=list
    )

    record_types: list[str] = Field(
        default_factory=list
    )


class DomainExercise(BaseModel):
    id: str
    name: str

    muscle: str | None = None
    equipment: str | None = None

    metadata: ExerciseDomainMetadata