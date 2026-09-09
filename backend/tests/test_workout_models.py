from pydantic import ValidationError

from app.domains.workouts.models import (
    ExerciseDiscomfort,
    Workout,
    WorkoutSet,
)


def test_workout_set_defaults_to_working():
    workout_set = WorkoutSet(
        setId="set-1",
        exerciseId="bench-press",
        setIndex=0,
    )

    assert workout_set.setType == "working"


def test_workout_set_accepts_warmup():
    workout_set = WorkoutSet(
        setId="set-warmup-1",
        exerciseId="bench-press",
        setIndex=-1,
        setType="warmup",
        weight=40,
        reps=10,
    )

    assert workout_set.setType == "warmup"


def test_workout_accepts_exercise_discomfort():
    workout = Workout(
        workoutId="workout-1",
        routineId="routine-1",
        sessionId="A",
        discomforts=[
            ExerciseDiscomfort(
                exerciseId="bench-press",
                painScore=3,
                area="hombro derecho",
                note="Molestia al bajar.",
            )
        ],
    )

    assert len(workout.discomforts) == 1
    assert workout.discomforts[0].painScore == 3


def test_discomfort_rejects_pain_above_ten():
    try:
        ExerciseDiscomfort(
            exerciseId="bench-press",
            painScore=11,
        )
    except ValidationError:
        return

    raise AssertionError(
        "painScore=11 debería ser inválido"
    )



def test_working_set_rejects_negative_index():
    try:
        WorkoutSet(
            setId="set-1",
            exerciseId="bench-press",
            setIndex=-1,
        )
    except ValidationError:
        return

    raise AssertionError(
        "Una serie efectiva no puede tener índice negativo."
    )


def test_warmup_rejects_non_negative_index():
    try:
        WorkoutSet(
            setId="warmup-1",
            exerciseId="bench-press",
            setIndex=0,
            setType="warmup",
        )
    except ValidationError:
        return

    raise AssertionError(
        "Un calentamiento debe usar índice negativo."
    )


def test_workout_accepts_rest_override_seconds():
    workout = Workout(
        workoutId="workout-1",
        routineId="routine-1",
        sessionId="session-1",
        restOverrideSeconds=150,
    )

    assert workout.restOverrideSeconds == 150


def test_workout_rejects_rest_override_above_one_hour():
    try:
        Workout(
            workoutId="workout-1",
            routineId="routine-1",
            sessionId="session-1",
            restOverrideSeconds=3601,
        )
    except ValidationError:
        return

    raise AssertionError(
        "restOverrideSeconds > 3600 debería ser inválido."
    )


def test_workout_rpe_is_an_explicit_optional_field_and_keeps_legacy_rir():
    legacy = WorkoutSet(setId="legacy", exerciseId="plank", setIndex=0, rir=2, durationSeconds=75)
    assert "rpe" in WorkoutSet.model_fields
    assert legacy.rpe is None
    assert legacy.rir == 2
    assert "rpe" not in legacy.model_dump(exclude_none=True)
    for rpe in (1, 8, 8.5, 10):
        recorded = WorkoutSet.model_validate({**legacy.model_dump(), "rpe": rpe})
        assert recorded.rpe == rpe
        assert "rpe" not in recorded.model_extra
        assert recorded.rir == 2


def test_workout_rpe_rejects_values_outside_the_scale():
    import pytest

    for rpe in (0, -1, 10.5, float("inf"), float("nan"), "invalid"):
        with pytest.raises(ValidationError):
            WorkoutSet(setId="set", exerciseId="plank", setIndex=0, rpe=rpe)
