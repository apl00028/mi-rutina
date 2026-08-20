from typing import Any

from app.domains.exercises.schemas import CustomExerciseCreate, CustomExerciseUpdate
from app.domains.exercises.models import Exercise
from app.domains.exercises.custom_repository import (
    create_custom_exercise,
    delete_custom_exercise,
    get_custom_exercise_by_id,
    list_custom_exercises,
    update_custom_exercise,
)
from app.core.auth import AuthenticatedUser


def custom_exercise_row_to_model(row: dict[str, Any]) -> Exercise:
    return Exercise(
        id=f"custom-{row['id']}",
        name=row["name"],
        muscle=row["muscle"],
        equipment=row["equipment"],
        type=row["type"],
        favorite=False,
        custom=True,
        notes=row.get("notes", ""),
        category=row["category"],
        recordTypes=row.get("record_types") or [],
    )


async def register_custom_exercise(
    user: AuthenticatedUser,
    payload: CustomExerciseCreate,
) -> Exercise:
    row = await create_custom_exercise(user, payload)

    return custom_exercise_row_to_model(row)


async def list_custom_exercise_models(
    user: AuthenticatedUser,
) -> list[Exercise]:
    rows = await list_custom_exercises(user)

    return [custom_exercise_row_to_model(row) for row in rows]


async def get_custom_exercise_model_by_id(
    user: AuthenticatedUser,
    exercise_id: str,
) -> Exercise | None:
    row = await get_custom_exercise_by_id(user, exercise_id)

    if row is None:
        return None

    return custom_exercise_row_to_model(row)


async def update_custom_exercise_model(
    user: AuthenticatedUser,
    exercise_id: str,
    payload: CustomExerciseUpdate,
) -> Exercise | None:
    row = await update_custom_exercise(
        user,
        exercise_id,
        payload.update_payload(),
    )

    if row is None:
        return None

    return custom_exercise_row_to_model(row)


async def remove_custom_exercise(
    user: AuthenticatedUser,
    exercise_id: str,
) -> bool:
    return await delete_custom_exercise(user, exercise_id)
