from app.models.training_profile import (
    TrainingProfileInput,
)
from app.services.routine_generator import (
    choose_weekly_structure,
    generate_routine,
    session_slots,
)


FULL_GYM_EQUIPMENT = [
    "barbell",
    "plates",
    "bench",
    "squat_rack",
    "dumbbells",
    "cable_machine",
    "lat_pulldown",
    "seated_row",
    "chest_press_machine",
    "shoulder_press_machine",
    "leg_press",
    "leg_extension",
    "seated_leg_curl",
    "lying_leg_curl",
    "calf_raise_machine",
    "mat",
    "bodyweight",
]


def profile(**overrides):
    data = {
        "primary_goal": "muscle_gain",
        "experience_level": "intermediate",
        "weekly_availability": 4,
        "session_duration_min": 60,
        "training_location": "commercial_gym",
        "available_equipment": [
            "barbell",
            "dumbbells",
            "machine",
            "cable_machine",
        ],
    }

    data.update(overrides)

    return TrainingProfileInput(**data)


def test_four_days_uses_upper_lower():
    result = choose_weekly_structure(
        profile()
    )

    assert result.id == "upper_lower_four"

    assert result.focuses == (
        "upper",
        "lower",
        "upper",
        "lower",
    )


def test_two_days_uses_full_body():
    result = choose_weekly_structure(
        profile(
            weekly_availability=2
        )
    )

    assert result.id == "two_day_full_body"


def test_three_day_hypertrophy_intermediate():
    result = choose_weekly_structure(
        profile(
            weekly_availability=3
        )
    )

    assert result.id == "upper_lower_full"


def test_three_day_returning_uses_full_body():
    result = choose_weekly_structure(
        profile(
            weekly_availability=3,
            experience_level="returning",
        )
    )

    assert result.id == "three_day_full_body"


def test_upper_session_has_required_patterns():
    slots = session_slots(
        focus="upper",
        index=0,
        duration=60,
        weekly_days=4,
    )

    patterns = {
        slot.pattern
        for slot in slots
    }

    assert "horizontal_push" in patterns
    assert "horizontal_pull" in patterns
    assert "vertical_pull" in patterns


def test_lower_session_has_required_patterns():
    slots = session_slots(
        focus="lower",
        index=0,
        duration=60,
        weekly_days=4,
    )

    patterns = {
        slot.pattern
        for slot in slots
    }

    assert "knee_dominant" in patterns
    assert "hip_hinge" in patterns
    assert "anti_extension_core" in patterns


def test_short_session_limits_exercises():
    slots = session_slots(
        focus="upper",
        index=0,
        duration=30,
        weekly_days=3,
    )

    assert len(slots) == 4


def test_high_frequency_limits_exercises():
    slots = session_slots(
        focus="full_body",
        index=0,
        duration=60,
        weekly_days=5,
    )

    assert len(slots) == 4


def test_generate_four_day_routine():
    result = generate_routine(
        profile(
            weekly_availability=4,
            session_duration_min=60,
            available_equipment=(
                FULL_GYM_EQUIPMENT
            ),
        )
    )

    assert result.structure_id == (
        "upper_lower_four"
    )

    assert len(result.sessions) == 4

    assert [
        session.focus
        for session in result.sessions
    ] == [
        "upper",
        "lower",
        "upper",
        "lower",
    ]


def test_generated_exercises_exist():
    result = generate_routine(
        profile(
            available_equipment=(
                FULL_GYM_EQUIPMENT
            ),
        )
    )

    exercise_ids = [
        exercise.exercise_id
        for session in result.sessions
        for exercise in session.exercises
    ]

    assert exercise_ids

    assert all(
        isinstance(exercise_id, str)
        and exercise_id
        for exercise_id in exercise_ids
    )


def test_avoided_exercise_is_not_generated():
    result = generate_routine(
        profile(
            available_equipment=(
                FULL_GYM_EQUIPMENT
            ),
            avoided_exercise_ids=[
                "bench-press",
            ],
        )
    )

    exercise_ids = {
        exercise.exercise_id
        for session in result.sessions
        for exercise in session.exercises
    }

    assert "bench-press" not in exercise_ids


def test_generated_session_has_no_duplicates():
    result = generate_routine(
        profile(
            available_equipment=(
                FULL_GYM_EQUIPMENT
            ),
        )
    )

    for session in result.sessions:
        ids = [
            exercise.exercise_id
            for exercise in session.exercises
        ]

        assert len(ids) == len(set(ids))


def test_plank_uses_duration_record_type():
    result = generate_routine(
        profile(
            weekly_availability=4,
            available_equipment=(
                FULL_GYM_EQUIPMENT
            ),
        )
    )

    plank = next(
        exercise
        for session in result.sessions
        for exercise in session.exercises
        if exercise.exercise_id == "plank"
    )

    assert plank.record_type == "duration"
    assert "s" in plank.target
    assert plank.target_rir is None


def test_weight_exercise_uses_weight_reps():
    result = generate_routine(
        profile(
            weekly_availability=4,
            available_equipment=(
                FULL_GYM_EQUIPMENT
            ),
        )
    )

    press = next(
        exercise
        for session in result.sessions
        for exercise in session.exercises
        if exercise.exercise_id
        == "dumbbell-bench-press"
    )

    assert press.record_type == "weight_reps"


def test_dead_bug_uses_guided_repetitions():
    result = generate_routine(
        profile(
            weekly_availability=4,
            available_equipment=(
                FULL_GYM_EQUIPMENT
            ),
        )
    )

    dead_bug = next(
        exercise
        for session in result.sessions
        for exercise in session.exercises
        if exercise.exercise_id
        == "dead-bug"
    )

    assert (
        dead_bug.record_type
        == "guided_repetitions"
    )

    assert "por lado" in dead_bug.target
    assert dead_bug.target_rir is None