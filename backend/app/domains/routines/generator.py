from dataclasses import dataclass

from app.domains.routines.generation_models import (
    GeneratedExercise,
    GeneratedSession,
    RoutineGenerationResult,
)
from app.domains.routines.profile_models import (
    TrainingProfileInput,
)
from app.domains.exercises.catalog_service import (
    compatible_exercises_by_pattern,
)


@dataclass(frozen=True)
class WeeklyStructure:
    id: str
    label: str
    focuses: tuple[str, ...]


@dataclass(frozen=True)
class ExerciseSlot:
    pattern: str
    role: str
    required: bool


SLOT_TEMPLATES = {
    "upper": (
        ExerciseSlot(
            "horizontal_push",
            "main",
            True,
        ),
        ExerciseSlot(
            "horizontal_pull",
            "main",
            True,
        ),
        ExerciseSlot(
            "vertical_pull",
            "main",
            True,
        ),
        ExerciseSlot(
            "vertical_push",
            "accessory",
            False,
        ),
        ExerciseSlot(
            "elbow_flexion",
            "accessory",
            False,
        ),
        ExerciseSlot(
            "elbow_extension",
            "accessory",
            False,
        ),
    ),
    "lower": (
        ExerciseSlot(
            "knee_dominant",
            "main",
            True,
        ),
        ExerciseSlot(
            "hip_hinge",
            "main",
            True,
        ),
        ExerciseSlot(
            "unilateral_lower_body",
            "main",
            False,
        ),
        ExerciseSlot(
            "knee_flexion",
            "accessory",
            False,
        ),
        ExerciseSlot(
            "calf_raise",
            "accessory",
            False,
        ),
        ExerciseSlot(
            "anti_extension_core",
            "accessory",
            True,
        ),
    ),
    "full_body": (
        ExerciseSlot(
            "knee_dominant",
            "main",
            True,
        ),
        ExerciseSlot(
            "horizontal_push",
            "main",
            True,
        ),
        ExerciseSlot(
            "horizontal_pull",
            "main",
            True,
        ),
        ExerciseSlot(
            "hip_hinge",
            "main",
            True,
        ),
        ExerciseSlot(
            "vertical_pull",
            "accessory",
            False,
        ),
        ExerciseSlot(
            "anti_extension_core",
            "accessory",
            False,
        ),
    ),
}


MAIN_EXERCISE_EXCLUSIONS = {
    "cable-chest-fly",
    "pec-deck-fly",
    "dumbbell-fly",
    "rear-delt-fly",
    "straight-arm-pulldown",
    "cable-pull-through",
}


def choose_weekly_structure(
    profile: TrainingProfileInput,
) -> WeeklyStructure:
    days = profile.weekly_availability
    goal = profile.primary_goal
    experience = profile.experience_level
    duration = profile.session_duration_min

    returning = (
        experience in {
            "beginner",
            "returning",
        }
        or goal == "return_to_training"
    )

    constrained = (
        duration <= 40
        or len(profile.injuries) >= 2
        or len(profile.pain_areas) >= 2
    )

    if days == 2:
        return WeeklyStructure(
            id="two_day_full_body",
            label="Full body A/B",
            focuses=(
                "full_body",
                "full_body",
            ),
        )

    if (
        days == 3
        and goal == "muscle_gain"
        and not returning
        and not constrained
    ):
        return WeeklyStructure(
            id="upper_lower_full",
            label="Torso / Pierna / Full body",
            focuses=(
                "upper",
                "lower",
                "full_body",
            ),
        )

    if days == 3:
        return WeeklyStructure(
            id="three_day_full_body",
            label="Full body rotativo",
            focuses=(
                "full_body",
                "full_body",
                "full_body",
            ),
        )

    if days == 4:
        return WeeklyStructure(
            id="upper_lower_four",
            label="Torso / Pierna",
            focuses=(
                "upper",
                "lower",
                "upper",
                "lower",
            ),
        )

    if days == 5:
        if returning or constrained:
            return WeeklyStructure(
                id="three_strength_two_support",
                label=(
                    "Tres sesiones globales "
                    "y dos de apoyo"
                ),
                focuses=(
                    "full_body",
                    "upper",
                    "lower",
                    "full_body",
                    "full_body",
                ),
            )

        return WeeklyStructure(
            id="upper_lower_five",
            label=(
                "Torso / Pierna "
                "con frecuencia distribuida"
            ),
            focuses=(
                "upper",
                "lower",
                "full_body",
                "upper",
                "lower",
            ),
        )

    return WeeklyStructure(
        id="upper_lower_six",
        label="Torso / Pierna alternos",
        focuses=(
            "upper",
            "lower",
            "upper",
            "lower",
            "upper",
            "lower",
        ),
    )


def rotate_slots(
    slots: tuple[ExerciseSlot, ...],
    index: int,
) -> tuple[ExerciseSlot, ...]:
    if not slots:
        return ()

    offset = index % min(
        3,
        len(slots),
    )

    return (
        slots[offset:]
        + slots[:offset]
    )


def session_slots(
    focus: str,
    index: int,
    duration: int,
    weekly_days: int,
) -> tuple[ExerciseSlot, ...]:
    source = rotate_slots(
        SLOT_TEMPLATES.get(
            focus,
            SLOT_TEMPLATES["full_body"],
        ),
        index,
    )

    if weekly_days >= 5:
        limit = 4
    elif duration <= 35:
        limit = 4
    elif duration <= 50:
        limit = 5
    else:
        limit = 6

    required = tuple(
        slot
        for slot in source
        if slot.required
    )

    optional = tuple(
        slot
        for slot in source
        if not slot.required
    )

    count = max(
        limit,
        len(required),
    )

    return (
        required
        + optional
    )[:count]


def _eligible_for_slot(
    exercise,
    slot: ExerciseSlot,
) -> bool:
    if (
        slot.role == "main"
        and exercise.id
        in MAIN_EXERCISE_EXCLUSIONS
    ):
        return False

    return True


def _exercise_priority(
    exercise,
    slot: ExerciseSlot,
    profile: TrainingProfileInput,
) -> tuple:
    metadata = exercise.metadata

    if profile.experience_level in {
        "beginner",
        "returning",
    }:
        return (
            0 if metadata.supported else 1,
            metadata.technical_complexity,
            metadata.stability_demand,
            metadata.balance_demand,
        )

    if profile.primary_goal == "muscle_gain":
        if slot.role == "main":
            return (
                (
                    0
                    if metadata.technical_complexity
                    in {2, 3}
                    else 1
                ),
                (
                    0
                    if not metadata.unilateral
                    else 1
                ),
                metadata.stability_demand,
                metadata.technical_complexity,
            )

        return (
            metadata.technical_complexity,
            metadata.stability_demand,
            metadata.balance_demand,
        )

    if profile.primary_goal == "strength_gain":
        if slot.role == "main":
            return (
                (
                    0
                    if metadata.technical_complexity
                    in {2, 3, 4}
                    else 1
                ),
                metadata.stability_demand,
                metadata.technical_complexity,
            )

        return (
            metadata.technical_complexity,
            metadata.stability_demand,
        )

    return (
        metadata.technical_complexity,
        metadata.stability_demand,
        metadata.balance_demand,
    )


def _select_exercise_for_slot(
    slot: ExerciseSlot,
    profile: TrainingProfileInput,
    used_exercise_ids: set[str],
    globally_used_ids: set[str],
):
    candidates = compatible_exercises_by_pattern(
        slot.pattern,
        available_equipment=(
            profile.available_equipment
        ),
        experience_level=(
            profile.experience_level
        ),
        avoided_exercise_ids=(
            list(profile.avoided_exercise_ids)
            + list(used_exercise_ids)
        ),
    )

    candidates = [
        exercise
        for exercise in candidates
        if _eligible_for_slot(
            exercise,
            slot,
        )
    ]

    if not candidates:
        return None

    candidates.sort(
        key=lambda exercise: (
            exercise.id
            in globally_used_ids,
            (
                0
                if exercise.id
                in profile.preferred_exercise_ids
                else 1
            ),
            _exercise_priority(
                exercise,
                slot,
                profile,
            ),
            exercise.id,
        )
    )

    return candidates[0]


def _prescription_for_slot(
    slot: ExerciseSlot,
    profile: TrainingProfileInput,
    record_type: str,
) -> tuple[int, str, str | None, int]:

    if record_type == "duration":
        if (
            profile.experience_level in {
                "beginner",
                "returning",
            }
            or profile.primary_goal
            == "return_to_training"
        ):
            return (
                2,
                "20-30 s",
                None,
                60,
            )

        return (
            2,
            "30-45 s",
            None,
            60,
        )

    if record_type == "guided_repetitions":
        if (
            profile.experience_level in {
                "beginner",
                "returning",
            }
            or profile.primary_goal
            == "return_to_training"
        ):
            return (
                2,
                "6-8 por lado",
                None,
                60,
            )

        return (
            2,
            "8-12 por lado",
            None,
            60,
        )

    if (
        profile.experience_level
        == "returning"
        or profile.primary_goal
        == "return_to_training"
    ):
        if slot.role == "main":
            return (
                2,
                "8-12",
                "3-4",
                90,
            )

        return (
            2,
            "10-15",
            "3-4",
            75,
        )

    if profile.primary_goal == "strength_gain":
        if slot.role == "main":
            return (
                3,
                "4-6",
                "2",
                180,
            )

        return (
            2,
            "8-12",
            "2-3",
            90,
        )

    if profile.primary_goal == "muscle_gain":
        if slot.role == "main":
            return (
                3,
                "6-10",
                "1-3",
                120,
            )

        return (
            2,
            "10-15",
            "1-3",
            75,
        )

    if slot.role == "main":
        return (
            3,
            "6-12",
            "2-3",
            120,
        )

    return (
        2,
        "10-15",
        "2-3",
        75,
    )


def generate_routine(
    profile: TrainingProfileInput,
) -> RoutineGenerationResult:
    structure = choose_weekly_structure(
        profile
    )

    generated_sessions: list[
        GeneratedSession
    ] = []

    warnings: list[str] = []

    globally_used_ids: set[str] = set()

    for index, focus in enumerate(
        structure.focuses
    ):
        slots = session_slots(
            focus=focus,
            index=index,
            duration=(
                profile.session_duration_min
            ),
            weekly_days=(
                profile.weekly_availability
            ),
        )

        exercises: list[
            GeneratedExercise
        ] = []

        used_exercise_ids: set[str] = set()

        for slot in slots:
            selected = _select_exercise_for_slot(
                slot,
                profile,
                used_exercise_ids,
                globally_used_ids,
            )

            if selected is None:
                if slot.required:
                    warnings.append(
                        "No compatible exercise "
                        f"for required pattern "
                        f"{slot.pattern} in "
                        f"session {index + 1}"
                    )

                continue

            used_exercise_ids.add(
                selected.id
            )

            globally_used_ids.add(
                selected.id
            )

            record_type = (
                selected.metadata.record_types[0]
                if selected.metadata.record_types
                else "weight_reps"
            )

            (
                sets,
                target,
                target_rir,
                rest_seconds,
            ) = _prescription_for_slot(
                slot,
                profile,
                record_type,
            )

            exercises.append(
                GeneratedExercise(
                    exercise_id=selected.id,
                    name=selected.name,
                    movement_pattern=(
                        selected.metadata
                        .movement_pattern
                    ),
                    role=slot.role,
                    record_type=record_type,
                    sets=sets,
                    target=target,
                    target_rir=target_rir,
                    rest_seconds=(
                        rest_seconds
                    ),
                )
            )

        generated_sessions.append(
            GeneratedSession(
                session_id=(
                    f"session-{index + 1}"
                ),
                name=(
                    f"Sesión {index + 1}"
                ),
                focus=focus,
                exercises=exercises,
            )
        )

    return RoutineGenerationResult(
        structure_id=structure.id,
        structure_label=structure.label,
        sessions=generated_sessions,
        warnings=warnings,
        rationale=[
            (
                f"{profile.weekly_availability} "
                "training days per week"
            ),
            (
                f"{profile.session_duration_min} "
                "minutes available per session"
            ),
            (
                "Experience level: "
                f"{profile.experience_level}"
            ),
            (
                "Primary goal: "
                f"{profile.primary_goal}"
            ),
        ],
    )