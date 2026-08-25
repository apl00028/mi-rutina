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
