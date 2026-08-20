import json
from functools import lru_cache
from pathlib import Path

from app.models.exercise_domain import (
    DomainExercise,
    ExerciseDomainMetadata,
)


DATA_DIR = (
    Path(__file__).resolve().parents[1]
    / "data"
)

EXERCISES_PATH = DATA_DIR / "exercises.json"
DOMAIN_PATH = DATA_DIR / "exercise_domain.json"


@lru_cache(maxsize=1)
def load_exercise_catalog() -> list[DomainExercise]:
    with EXERCISES_PATH.open(
        "r",
        encoding="utf-8",
    ) as file:
        exercises = json.load(file)

    with DOMAIN_PATH.open(
        "r",
        encoding="utf-8",
    ) as file:
        domain = json.load(file)

    result: list[DomainExercise] = []

    for exercise in exercises:
        exercise_id = exercise["id"]

        metadata_raw = domain.get(
            exercise_id
        )

        if metadata_raw is None:
            raise RuntimeError(
                f"Missing domain metadata for "
                f"{exercise_id}"
            )

        metadata = ExerciseDomainMetadata(
            movement_pattern=(
                metadata_raw[
                    "movement_pattern"
                ]
            ),
            required_equipment=(
                metadata_raw.get(
                    "required_equipment",
                    [],
                )
            ),
            difficulty=metadata_raw.get(
                "difficulty"
            ),
            technical_complexity=(
                metadata_raw.get(
                    "technical_complexity",
                    1,
                )
            ),
            stability_demand=(
                metadata_raw.get(
                    "stability_demand",
                    1,
                )
            ),
            balance_demand=(
                metadata_raw.get(
                    "balance_demand",
                    1,
                )
            ),
            supported=bool(
                metadata_raw.get(
                    "supported",
                    False,
                )
            ),
            unilateral=bool(
                metadata_raw.get(
                    "unilateral",
                    False,
                )
            ),
            body_positions=(
                metadata_raw.get(
                    "body_positions",
                    [],
                )
            ),
            record_types=(
                metadata_raw.get(
                    "record_types",
                    [],
                )
            ),
        )

        result.append(
            DomainExercise(
                id=exercise_id,
                name=exercise["name"],
                muscle=exercise.get(
                    "muscle"
                ),
                equipment=exercise.get(
                    "equipment"
                ),
                metadata=metadata,
            )
        )

    return result


def exercises_by_pattern(
    pattern: str,
) -> list[DomainExercise]:
    return [
        exercise
        for exercise
        in load_exercise_catalog()
        if (
            exercise.metadata
            .movement_pattern
            == pattern
        )
    ]

EXPERIENCE_RANK = {
    "beginner": 1,
    "returning": 1,
    "intermediate": 2,
    "advanced": 3,
}


def is_exercise_compatible(
    exercise: DomainExercise,
    *,
    available_equipment: list[str],
    experience_level: str,
    avoided_exercise_ids: list[str] | None = None,
) -> bool:
    avoided = set(
        avoided_exercise_ids or []
    )

    if exercise.id in avoided:
        return False

    required = set(
        exercise.metadata.required_equipment
    )

    available = set(
        available_equipment
    )

    if not required.issubset(available):
        return False

    exercise_level = (
        exercise.metadata.difficulty
        or "beginner"
    )

    if (
        EXPERIENCE_RANK.get(
            exercise_level,
            1,
        )
        >
        EXPERIENCE_RANK.get(
            experience_level,
            1,
        )
    ):
        return False

    return True


def compatible_exercises_by_pattern(
    pattern: str,
    *,
    available_equipment: list[str],
    experience_level: str,
    avoided_exercise_ids: list[str] | None = None,
) -> list[DomainExercise]:
    return [
        exercise
        for exercise in exercises_by_pattern(
            pattern
        )
        if is_exercise_compatible(
            exercise,
            available_equipment=(
                available_equipment
            ),
            experience_level=(
                experience_level
            ),
            avoided_exercise_ids=(
                avoided_exercise_ids
            ),
        )
    ]