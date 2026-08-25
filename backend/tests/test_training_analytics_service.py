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
    set_type="working",
    set_index=0,
):
    payload = {
        "setId": set_id,
        "exerciseId": exercise_id,
        "setIndex": set_index,
        "setType": set_type,
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
    assert result.exercises[0].bestE1rm is None


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


def test_training_analytics_adds_recent_e1rm_trend(monkeypatch):
    rows = [
        row(
            "old",
            finished_at="2026-08-01T10:00:00Z",
            sets=[
                completed_set(
                    "old-set",
                    "bench-press",
                    weight=200,
                    reps=10,
                    completed_at="2026-08-01T09:30:00Z",
                )
            ],
        ),
        row(
            "w1",
            finished_at="2026-08-10T10:00:00Z",
            sets=[
                completed_set(
                    "w1-set",
                    "bench-press",
                    weight=90,
                    reps=8,
                    completed_at="2026-08-10T09:30:00Z",
                )
            ],
        ),
        row(
            "w2",
            finished_at="2026-08-11T10:00:00Z",
            sets=[
                completed_set(
                    "w2-set",
                    "bench-press",
                    weight=92.5,
                    reps=8,
                    completed_at="2026-08-11T09:30:00Z",
                )
            ],
        ),
        row(
            "w3",
            finished_at="2026-08-12T10:00:00Z",
            sets=[
                completed_set(
                    "w3-set",
                    "bench-press",
                    weight=95,
                    reps=8,
                    completed_at="2026-08-12T09:30:00Z",
                )
            ],
        ),
        row(
            "w4",
            finished_at="2026-08-13T10:00:00Z",
            sets=[
                completed_set(
                    "w4-set",
                    "bench-press",
                    weight=97.5,
                    reps=8,
                    completed_at="2026-08-13T09:30:00Z",
                )
            ],
        ),
        row(
            "w5",
            finished_at="2026-08-14T10:00:00Z",
            sets=[
                completed_set(
                    "w5-set",
                    "bench-press",
                    weight=100,
                    reps=8,
                    completed_at="2026-08-14T09:30:00Z",
                )
            ],
        ),
        row(
            "draft",
            status="in_progress",
            finished_at="2026-08-15T10:00:00Z",
            sets=[
                completed_set(
                    "draft-set",
                    "bench-press",
                    weight=40,
                    reps=3,
                    completed_at="2026-08-15T09:30:00Z",
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

    bench = next(
        item
        for item in result.exercises
        if item.exerciseId == "bench-press"
    )

    assert bench.trend == "improving"
    assert bench.trendExposures == 5
    assert round(bench.firstE1rm or 0, 2) == 114
    assert round(bench.lastE1rm or 0, 2) == 126.67
    assert round(bench.e1rmChange or 0, 2) == 12.67
    assert round(bench.e1rmChangePercent or 0, 2) == 11.11
    assert bench.signal == "Progreso consistente"

    bench_progress = next(
        item
        for item in result.progress
        if item.exerciseId == "bench-press"
    )
    assert bench_progress.points[-1].totalReps == 8
    assert bench_progress.points[-1].validSets == 1


def test_training_analytics_trend_stays_stable_inside_noise(monkeypatch):
    rows = [
        row(
            "w1",
            finished_at="2026-08-10T10:00:00Z",
            sets=[
                completed_set(
                    "w1-set",
                    "bench-press",
                    weight=90,
                    reps=10,
                    completed_at="2026-08-10T09:30:00Z",
                )
            ],
        ),
        row(
            "w2",
            finished_at="2026-08-11T10:00:00Z",
            sets=[
                completed_set(
                    "w2-set",
                    "bench-press",
                    weight=90.5,
                    reps=10,
                    completed_at="2026-08-11T09:30:00Z",
                )
            ],
        ),
        row(
            "w3",
            finished_at="2026-08-12T10:00:00Z",
            sets=[
                completed_set(
                    "w3-set",
                    "bench-press",
                    weight=91,
                    reps=10,
                    completed_at="2026-08-12T09:30:00Z",
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

    bench = result.exercises[0]

    assert bench.trend == "stable"
    assert bench.trendExposures == 3
    assert bench.plateau is False


def test_training_analytics_detects_plateau_with_enough_exposures(monkeypatch):
    rows = [
        row(
            f"w{index}",
            finished_at=f"2026-08-1{index}T10:00:00Z",
            sets=[
                completed_set(
                    f"w{index}-set",
                    "bench-press",
                    weight=90,
                    reps=10,
                    rir=2,
                    completed_at=f"2026-08-1{index}T09:30:00Z",
                )
            ],
        )
        for index in range(1, 5)
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

    bench = result.exercises[0]

    assert bench.trend == "stable"
    assert bench.plateau is True
    assert bench.signal == "Sin mejora relevante en 4 exposiciones"


def test_training_analytics_does_not_decline_from_one_outlier(monkeypatch):
    rows = [
        row(
            "w1",
            finished_at="2026-08-10T10:00:00Z",
            sets=[
                completed_set(
                    "w1-set",
                    "bench-press",
                    weight=100,
                    reps=8,
                    completed_at="2026-08-10T09:30:00Z",
                )
            ],
        ),
        row(
            "bad-day",
            finished_at="2026-08-11T10:00:00Z",
            sets=[
                completed_set(
                    "bad-day-set",
                    "bench-press",
                    weight=80,
                    reps=5,
                    completed_at="2026-08-11T09:30:00Z",
                )
            ],
        ),
        row(
            "w3",
            finished_at="2026-08-12T10:00:00Z",
            sets=[
                completed_set(
                    "w3-set",
                    "bench-press",
                    weight=99,
                    reps=8,
                    completed_at="2026-08-12T09:30:00Z",
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

    assert result.exercises[0].trend == "stable"


def test_training_analytics_ignores_warmup_sets(monkeypatch):
    async def fake_list_workouts(_user):
        return [
            row(
                "workout-warmup",
                sets=[
                    completed_set(
                        "warmup-1",
                        "bench-press",
                        weight=40,
                        reps=10,
                        set_type="warmup",
                        set_index=-1,
                    ),
                    completed_set(
                        "working-1",
                        "bench-press",
                        weight=100,
                        reps=5,
                    ),
                ],
            )
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
    assert result.summary.completedSets == 1
    assert result.summary.uniqueExercises == 1
    assert result.summary.totalVolume == 500

    assert len(result.exercises) == 1
    assert result.exercises[0].completedSets == 1
    assert result.exercises[0].maxWeight == 100
