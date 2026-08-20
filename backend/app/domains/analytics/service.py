from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from pydantic import ValidationError

from app.core.auth import AuthenticatedUser
from app.domains.analytics.models import (
    ExerciseAnalyticsItem,
    ExerciseProgressPoint,
    ExerciseProgressSeries,
    MuscleGroupAnalyticsItem,
    TrainingAnalyticsPeriod,
    TrainingAnalyticsResponse,
    TrainingAnalyticsSummary,
)
from app.domains.workouts.models import Workout, WorkoutSet
from app.domains.workouts.repository import (
    list_workouts,
)
from app.domains.exercises.catalog_service import (
    load_exercise_catalog,
)
from app.domains.workouts.service import (
    workout_row_to_model,
)


@dataclass
class CatalogExercise:
    exercise_id: str
    name: str
    muscle: str | None
    record_types: list[str]


@dataclass
class ExerciseAggregate:
    exercise_id: str
    name: str
    record_types: list[str]
    workout_ids: set[str] = field(
        default_factory=set
    )
    completed_sets: int = 0
    max_weight: float | None = None
    best_e1rm: float | None = None
    best_weight: float | None = None
    best_reps: int | None = None
    total_volume: float = 0
    has_volume: bool = False
    last_date: datetime | None = None
    last_mark: str | None = None


@dataclass
class WorkoutExerciseAggregate:
    workout_id: str
    date: datetime
    max_weight: float | None = None
    best_e1rm: float | None = None
    best_reps: int | None = None
    rir: float | None = None


def _parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None

    try:
        parsed = datetime.fromisoformat(
            value.replace("Z", "+00:00")
        )
    except ValueError:
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)

    return parsed.astimezone(UTC)


def _period_start(
    period: TrainingAnalyticsPeriod,
    now: datetime,
) -> datetime | None:
    if period == "4w":
        return now - timedelta(weeks=4)

    if period == "3m":
        return _subtract_months(now, 3)

    if period == "6m":
        return _subtract_months(now, 6)

    return None


def _subtract_months(
    value: datetime,
    months: int,
) -> datetime:
    month = value.month - months
    year = value.year

    while month <= 0:
        month += 12
        year -= 1

    days_in_month = [
        31,
        29 if (
            year % 4 == 0
            and (
                year % 100 != 0
                or year % 400 == 0
            )
        ) else 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ]

    return value.replace(
        year=year,
        month=month,
        day=min(
            value.day,
            days_in_month[month - 1],
        ),
    )


def _is_valid_number(value: Any) -> bool:
    return isinstance(
        value,
        int | float,
    ) and value >= 0


def _is_valid_reps(value: Any) -> bool:
    return isinstance(
        value,
        int,
    ) and value > 0


def _epley_e1rm(
    weight: float,
    reps: int,
) -> float:
    # Epley estimate: useful for comparing sets within one exercise.
    return weight * (1 + reps / 30)


def _format_number(value: float) -> str:
    if value.is_integer():
        return str(int(value))

    return f"{value:.1f}"


def _format_weight_reps_mark(
    weight: float,
    reps: int,
) -> str:
    return (
        f"{_format_number(weight)} kg x "
        f"{reps} reps"
    )


def _catalog_by_id() -> dict[str, CatalogExercise]:
    result: dict[str, CatalogExercise] = {}

    for exercise in load_exercise_catalog():
        result[exercise.id] = CatalogExercise(
            exercise_id=exercise.id,
            name=exercise.name,
            muscle=exercise.muscle,
            record_types=(
                exercise.metadata.record_types
                or []
            ),
        )

    return result


def _record_type_for_set(
    workout_set: WorkoutSet,
    exercise: CatalogExercise | None,
) -> str | None:
    extra = workout_set.model_extra or {}

    explicit = extra.get(
        "recordType",
        extra.get("record_type"),
    )

    if isinstance(explicit, str) and explicit:
        return explicit

    record_types = (
        exercise.record_types
        if exercise is not None
        else []
    )

    if len(record_types) == 1:
        return record_types[0]

    if "weight_reps" in record_types:
        return "weight_reps"

    return None


def _workout_date(
    workout: Workout,
) -> datetime | None:
    return (
        _parse_datetime(workout.finishedAt)
        or _parse_datetime(workout.startedAt)
    )


def _completed_set_date(
    workout_set: WorkoutSet,
) -> datetime | None:
    return _parse_datetime(
        workout_set.completedAt
    )


def _safe_workout_from_row(
    row: dict[str, Any],
) -> Workout | None:
    try:
        return workout_row_to_model(row)
    except (RuntimeError, ValidationError):
        return None


def _is_in_period(
    date: datetime,
    from_date: datetime | None,
    to_date: datetime,
) -> bool:
    if date > to_date:
        return False

    if (
        from_date is not None
        and date < from_date
    ):
        return False

    return True


async def get_training_analytics(
    user: AuthenticatedUser,
    *,
    period: TrainingAnalyticsPeriod = "4w",
    now: datetime | None = None,
) -> TrainingAnalyticsResponse:
    current = now or datetime.now(UTC)

    if current.tzinfo is None:
        current = current.replace(tzinfo=UTC)

    current = current.astimezone(UTC)
    from_date = _period_start(period, current)

    rows = await list_workouts(user)
    catalog = _catalog_by_id()

    summary = TrainingAnalyticsSummary()
    unique_exercise_ids: set[str] = set()
    muscle_sets: dict[str, int] = defaultdict(int)
    exercise_aggregates: dict[
        str,
        ExerciseAggregate,
    ] = {}
    progress_aggregates: dict[
        tuple[str, str],
        WorkoutExerciseAggregate,
    ] = {}

    for row in rows:
        workout = _safe_workout_from_row(row)

        if workout is None:
            continue

        if workout.status != "finished":
            continue

        date = _workout_date(workout)

        if date is None:
            continue

        if not _is_in_period(
            date,
            from_date,
            current,
        ):
            continue

        summary.workouts += 1

        for workout_set in workout.sets:
            if not workout_set.exerciseId:
                continue

            if (
                _completed_set_date(workout_set)
                is None
            ):
                continue

            exercise = catalog.get(
                workout_set.exerciseId
            )
            record_type = _record_type_for_set(
                workout_set,
                exercise,
            )

            summary.completedSets += 1
            unique_exercise_ids.add(
                workout_set.exerciseId
            )

            if exercise is not None and exercise.muscle:
                muscle_sets[exercise.muscle] += 1

            aggregate = exercise_aggregates.get(
                workout_set.exerciseId
            )

            if aggregate is None:
                aggregate = ExerciseAggregate(
                    exercise_id=workout_set.exerciseId,
                    name=(
                        exercise.name
                        if exercise is not None
                        else workout_set.exerciseId
                    ),
                    record_types=(
                        exercise.record_types
                        if exercise is not None
                        else (
                            [record_type]
                            if record_type
                            else []
                        )
                    ),
                )
                exercise_aggregates[
                    workout_set.exerciseId
                ] = aggregate

            aggregate.workout_ids.add(
                workout.workoutId
            )
            aggregate.completed_sets += 1

            progress_key = (
                workout_set.exerciseId,
                workout.workoutId,
            )
            progress = progress_aggregates.get(
                progress_key
            )

            if progress is None:
                progress = WorkoutExerciseAggregate(
                    workout_id=workout.workoutId,
                    date=date,
                )
                progress_aggregates[
                    progress_key
                ] = progress

            if record_type != "weight_reps":
                continue

            if not (
                _is_valid_number(
                    workout_set.weight
                )
                and _is_valid_reps(
                    workout_set.reps
                )
            ):
                continue

            weight = float(workout_set.weight)
            reps = int(workout_set.reps)
            volume = weight * reps
            e1rm = _epley_e1rm(
                weight,
                reps,
            )

            summary.totalVolume += volume
            aggregate.total_volume += volume
            aggregate.has_volume = True

            if (
                aggregate.max_weight is None
                or weight > aggregate.max_weight
            ):
                aggregate.max_weight = weight

            if (
                aggregate.best_e1rm is None
                or e1rm > aggregate.best_e1rm
            ):
                aggregate.best_e1rm = e1rm
                aggregate.best_weight = weight
                aggregate.best_reps = reps

            if (
                aggregate.last_date is None
                or date >= aggregate.last_date
            ):
                aggregate.last_date = date
                aggregate.last_mark = (
                    _format_weight_reps_mark(
                        weight,
                        reps,
                    )
                )

            if (
                progress.max_weight is None
                or weight > progress.max_weight
            ):
                progress.max_weight = weight

            if (
                progress.best_e1rm is None
                or e1rm > progress.best_e1rm
            ):
                progress.best_e1rm = e1rm
                progress.best_reps = reps
                progress.rir = workout_set.rir

    summary.uniqueExercises = len(
        unique_exercise_ids
    )

    muscle_groups = [
        MuscleGroupAnalyticsItem(
            muscle=muscle,
            completedSets=sets,
        )
        for muscle, sets
        in sorted(
            muscle_sets.items(),
            key=lambda item: (
                -item[1],
                item[0],
            ),
        )
    ]

    exercises = [
        ExerciseAnalyticsItem(
            exerciseId=aggregate.exercise_id,
            name=aggregate.name,
            recordTypes=aggregate.record_types,
            sessions=len(
                aggregate.workout_ids
            ),
            completedSets=aggregate.completed_sets,
            maxWeight=aggregate.max_weight,
            bestSet=(
                _format_weight_reps_mark(
                    aggregate.best_weight,
                    aggregate.best_reps,
                )
                if (
                    aggregate.best_weight
                    is not None
                    and aggregate.best_reps
                    is not None
                )
                else None
            ),
            bestE1rm=aggregate.best_e1rm,
            totalVolume=(
                aggregate.total_volume
                if aggregate.has_volume
                else None
            ),
            lastMark=aggregate.last_mark,
        )
        for aggregate in sorted(
            exercise_aggregates.values(),
            key=lambda item: (
                -item.completed_sets,
                item.name,
            ),
        )
    ]

    points_by_exercise: dict[
        str,
        list[ExerciseProgressPoint],
    ] = defaultdict(list)

    for (
        exercise_id,
        _workout_id,
    ), aggregate in sorted(
        progress_aggregates.items(),
        key=lambda item: item[1].date,
    ):
        points_by_exercise[
            exercise_id
        ].append(
            ExerciseProgressPoint(
                workoutId=aggregate.workout_id,
                date=aggregate.date.isoformat(),
                maxWeight=aggregate.max_weight,
                bestE1rm=aggregate.best_e1rm,
                bestReps=aggregate.best_reps,
                rir=aggregate.rir,
            )
        )

    progress = [
        ExerciseProgressSeries(
            exerciseId=exercise.exerciseId,
            name=exercise.name,
            points=points_by_exercise.get(
                exercise.exerciseId,
                [],
            ),
        )
        for exercise in exercises
    ]

    return TrainingAnalyticsResponse(
        period=period,
        fromDate=(
            from_date.isoformat()
            if from_date is not None
            else None
        ),
        toDate=current.isoformat(),
        summary=summary,
        muscleGroups=muscle_groups,
        exercises=exercises,
        progress=progress,
    )
