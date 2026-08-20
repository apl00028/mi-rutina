from asyncio import run
from datetime import UTC, datetime

from app.core.auth import AuthenticatedUser
from app.domains.analytics import service


def user(user_id="user-123"):
    return AuthenticatedUser(
        id=user_id,
        email=f"{user_id}@example.com",
        access_token="token-123",
    )


def row(
    workout_id,
    *,
    user_id="user-123",
    status="finished",
    started_at="2026-08-10T09:00:00Z",
    finished_at="2026-08-10T10:00:00Z",
    sets=None,
):
    return {
        "id": workout_id,
        "user_id": user_id,
        "created_at": started_at,
        "updated_at": finished_at,
        "data": {
            "workoutId": workout_id,
            "routineId": "routine-1",
            "sessionId": "session-a",
            "status": status,
            "startedAt": started_at,
            "finishedAt": finished_at,
            "sets": sets or [],
        },
    }


def completed_set(
    set_id,
    exercise_id,
    *,
    weight=100,
    reps=5,
    rir=2,
    completed_at="2026-08-10T09:30:00Z",
    record_type=None,
):
    payload = {
        "setId": set_id,
        "exerciseId": exercise_id,
        "setIndex": 0,
        "weight": weight,
        "reps": reps,
        "rir": rir,
        "completedAt": completed_at,
    }

    if record_type is not None:
        payload["recordType"] = record_type

    return payload


def analytics(rows, period="4w"):
    async def fake_list_workouts(authenticated_user):
        assert authenticated_user.id == "user-123"
        return rows

    service.list_workouts = fake_list_workouts

    return run(
        service.get_training_analytics(
            user(),
            period=period,
            now=datetime(
                2026,
                8,
                20,
                tzinfo=UTC,
            ),
        )
    )


def test_training_analytics_counts_finished_workouts_and_sets(monkeypatch):
    async def fake_list_workouts(authenticated_user):
        assert authenticated_user.id == "user-123"
        return [
            row(
                "workout-1",
                sets=[
                    completed_set(
                        "set-1",
                        "bench-press",
                        weight=100,
                        reps=5,
                    ),
                    completed_set(
                        "set-2",
                        "lat-pulldown",
                        weight=60,
                        reps=10,
                    ),
                ],
            ),
            row(
                "workout-2",
                status="in_progress",
                sets=[
                    completed_set(
                        "set-3",
                        "bench-press",
                    )
                ],
            ),
        ]

    monkeypatch.setattr(
        service,
        "list_workouts",
        fake_list_workouts,
    )

    result = run(
        service.get_training_analytics(
            user(),
            period="4w",
            now=datetime(
                2026,
                8,
                20,
                tzinfo=UTC,
            ),
        )
    )

    assert result.summary.workouts == 1
    assert result.summary.completedSets == 2
    assert result.summary.uniqueExercises == 2
    assert result.summary.totalVolume == 1100


def test_training_analytics_filters_periods(monkeypatch):
    rows = [
        row(
            "recent",
            finished_at="2026-08-05T10:00:00Z",
            sets=[
                completed_set(
                    "recent-set",
                    "bench-press",
                    completed_at="2026-08-05T09:30:00Z",
                )
            ],
        ),
        row(
            "three-months",
            started_at="2026-04-10T09:00:00Z",
            finished_at="2026-04-10T10:00:00Z",
            sets=[
                completed_set(
                    "three-months-set",
                    "lat-pulldown",
                    completed_at="2026-04-10T09:30:00Z",
                )
            ],
        ),
    ]

    async def fake_list_workouts(_user):
        return rows

    monkeypatch.setattr(
        service,
        "list_workouts",
        fake_list_workouts,
    )

    four_weeks = run(
        service.get_training_analytics(
            user(),
            period="4w",
            now=datetime(
                2026,
                8,
                20,
                tzinfo=UTC,
            ),
        )
    )
    six_months = run(
        service.get_training_analytics(
            user(),
            period="6m",
            now=datetime(
                2026,
                8,
                20,
                tzinfo=UTC,
            ),
        )
    )
    all_time = run(
        service.get_training_analytics(
            user(),
            period="all",
            now=datetime(
                2026,
                8,
                20,
                tzinfo=UTC,
            ),
        )
    )

    assert four_weeks.summary.workouts == 1
    assert six_months.summary.workouts == 2
    assert all_time.summary.workouts == 2


def test_training_analytics_ignores_incomplete_and_malformed_data(monkeypatch):
    rows = [
        row(
            "workout-1",
            sets=[
                {
                    "setId": "missing-completed-at",
                    "exerciseId": "bench-press",
                    "setIndex": 0,
                    "weight": 100,
                    "reps": 5,
                },
                completed_set(
                    "bad-weight",
                    "bench-press",
                    weight=None,
                    reps=5,
                ),
                completed_set(
                    "duration",
                    "bench-press",
                    weight=999,
                    reps=1,
                    record_type="duration",
                ),
            ],
        ),
        {
            "id": "malformed",
            "data": "not-a-workout",
        },
    ]

    async def fake_list_workouts(_user):
        return rows

    monkeypatch.setattr(
        service,
        "list_workouts",
        fake_list_workouts,
    )

    result = run(
        service.get_training_analytics(
            user(),
            period="4w",
            now=datetime(
                2026,
                8,
                20,
                tzinfo=UTC,
            ),
        )
    )

    assert result.summary.workouts == 1
    assert result.summary.completedSets == 2
    assert result.summary.totalVolume == 0
    assert result.exercises[0].totalVolume is None


def test_training_analytics_classifies_by_exercise_id(monkeypatch):
    rows = [
        row(
            "workout-1",
            sets=[
                completed_set(
                    "set-1",
                    "bench-press",
                ),
                completed_set(
                    "set-2",
                    "lat-pulldown",
                ),
                completed_set(
                    "set-3",
                    "bench-press",
                    weight=120,
                    reps=3,
                ),
            ],
        )
    ]

    async def fake_list_workouts(_user):
        return rows

    monkeypatch.setattr(
        service,
        "list_workouts",
        fake_list_workouts,
    )

    result = run(
        service.get_training_analytics(
            user(),
            period="4w",
            now=datetime(
                2026,
                8,
                20,
                tzinfo=UTC,
            ),
        )
    )

    assert [
        item.model_dump()
        for item in result.muscleGroups[:2]
    ] == [
        {
            "muscle": "Pecho",
            "completedSets": 2,
        },
        {
            "muscle": "Espalda",
            "completedSets": 1,
        },
    ]

    bench = next(
        item
        for item in result.exercises
        if item.exerciseId == "bench-press"
    )
    assert bench.sessions == 1
    assert bench.completedSets == 2
    assert bench.maxWeight == 120
    assert bench.bestSet == "120 kg x 3 reps"
    assert round(bench.bestE1rm or 0, 2) == 132

    bench_progress = next(
        item
        for item in result.progress
        if item.exerciseId == "bench-press"
    )
    assert len(bench_progress.points) == 1
    assert bench_progress.points[0].bestReps == 3
