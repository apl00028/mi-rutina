from typing import Any

from auth import AuthenticatedUser
from app.models.routine import Routine
from app.repositories.routines import get_routine_by_id, list_routines


def routine_row_to_model(row: dict[str, Any]) -> Routine:
    data = row.get("data")

    if not isinstance(data, dict):
        raise RuntimeError("Unexpected Supabase response.")

    payload = dict(data)
    payload.setdefault("routineId", row.get("id"))
    payload.setdefault("createdAt", row.get("created_at"))
    payload.setdefault("updatedAt", row.get("updated_at"))

    return Routine.model_validate(payload)


async def list_user_routines(
    user: AuthenticatedUser,
) -> list[Routine]:
    rows = await list_routines(user)

    return [routine_row_to_model(row) for row in rows]


async def get_user_routine_by_id(
    user: AuthenticatedUser,
    routine_id: str,
) -> Routine | None:
    row = await get_routine_by_id(user, routine_id)

    if row is None:
        return None

    return routine_row_to_model(row)
