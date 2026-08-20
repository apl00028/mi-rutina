from typing import Any

from auth import AuthenticatedUser
from app.models.workout import Workout
from app.repositories.workouts import (
    create_workout,
    delete_workout,
    get_workout_by_id,
    list_workouts,
    replace_workout,
)


USER_ID_FIELDS = {
    "user_id",
    "userId",
}


def _strip_client_user_fields(
    payload: dict[str, Any],
) -> dict[str, Any]:
    return {
        key: value
        for key, value in payload.items()
        if key not in USER_ID_FIELDS
    }


async def delete_user_workout(
    user: AuthenticatedUser,
    workout_id: str,
) -> bool:
    return await delete_workout(user, workout_id)

def workout_row_to_model(row: dict[str, Any]) -> Workout:
    data = row.get("data")

    if not isinstance(data, dict):
        raise RuntimeError("Unexpected Supabase response.")

    payload = _strip_client_user_fields(
        dict(data)
    )
    payload.setdefault("workoutId", row.get("id"))
    payload.setdefault("startedAt", row.get("created_at"))

    return Workout.model_validate(payload)


def workout_to_storage_payload(workout: Workout) -> dict[str, Any]:
    return _strip_client_user_fields(
        workout.model_dump(
            exclude_none=True
        )
    )


async def list_user_workouts(
    user: AuthenticatedUser,
) -> list[Workout]:
    rows = await list_workouts(user)

    return [workout_row_to_model(row) for row in rows]


async def get_user_workout_by_id(
    user: AuthenticatedUser,
    workout_id: str,
) -> Workout | None:
    row = await get_workout_by_id(user, workout_id)

    if row is None:
        return None

    return workout_row_to_model(row)


async def create_user_workout(
    user: AuthenticatedUser,
    workout: Workout,
) -> Workout:
    row = await create_workout(
        user,
        workout_to_storage_payload(workout),
    )

    return workout_row_to_model(row)


async def replace_user_workout(
    user: AuthenticatedUser,
    workout_id: str,
    workout: Workout,
) -> Workout | None:
    row = await replace_workout(
        user,
        workout_id,
        workout_to_storage_payload(workout),
    )

    if row is None:
        return None

    return workout_row_to_model(row)
