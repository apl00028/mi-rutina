from app.services.exercise_catalog import (
    compatible_exercises_by_pattern,
    exercises_by_pattern,
    load_exercise_catalog,
)


def test_catalog_has_100_exercises():
    catalog = load_exercise_catalog()
    assert len(catalog) == 100


def test_all_exercises_have_domain_metadata():
    catalog = load_exercise_catalog()

    assert all(
        exercise.metadata.movement_pattern
        for exercise in catalog
    )


def test_horizontal_push_contains_bench_press():
    exercises = exercises_by_pattern(
        "horizontal_push"
    )

    ids = {
        exercise.id
        for exercise in exercises
    }

    assert "bench-press" in ids


def test_knee_flexion_contains_leg_curl():
    exercises = exercises_by_pattern(
        "knee_flexion"
    )

    ids = {
        exercise.id
        for exercise in exercises
    }

    assert "leg-curl" in ids


def test_beginner_with_full_gym_gets_compatible_push():
    exercises = compatible_exercises_by_pattern(
        "horizontal_push",
        available_equipment=[
            "barbell",
            "plates",
            "bench",
            "squat_rack",
            "dumbbells",
            "chest_press_machine",
        ],
        experience_level="beginner",
    )

    ids = {
        exercise.id
        for exercise in exercises
    }

    assert "dumbbell-bench-press" in ids


def test_beginner_does_not_get_intermediate_bench_press():
    exercises = compatible_exercises_by_pattern(
        "horizontal_push",
        available_equipment=[
            "barbell",
            "plates",
            "bench",
            "squat_rack",
        ],
        experience_level="beginner",
    )

    ids = {
        exercise.id
        for exercise in exercises
    }

    assert "bench-press" not in ids


def test_missing_equipment_excludes_exercise():
    exercises = compatible_exercises_by_pattern(
        "horizontal_push",
        available_equipment=[
            "bodyweight",
            "mat",
        ],
        experience_level="intermediate",
    )

    ids = {
        exercise.id
        for exercise in exercises
    }

    assert "bench-press" not in ids


def test_avoided_exercise_is_removed():
    exercises = compatible_exercises_by_pattern(
        "knee_flexion",
        available_equipment=[
            "seated_leg_curl",
        ],
        experience_level="beginner",
        avoided_exercise_ids=[
            "leg-curl",
        ],
    )

    ids = {
        exercise.id
        for exercise in exercises
    }

    assert "leg-curl" not in ids
