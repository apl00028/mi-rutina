from typing import Any

from app.core.auth import AuthenticatedUser
from app.domains.routines.models import Routine
from app.domains.routines.repository import (
    create_routine,
    delete_routine,
    get_active_routine,
    get_routine_by_id,
    list_routines,
    replace_routine,
    set_active_routine,
)


CLIENT_CONTROLLED_FIELDS = {
    "user_id",
    "userId",
    "owner_id",
    "ownerId",
    "created_by",
    "createdBy",
    "is_admin",
    "isAdmin",
}


def _strip_client_controlled_fields(
    payload: dict[str, Any],
) -> dict[str, Any]:
    return {
        key: value
        for key, value in payload.items()
        if key not in CLIENT_CONTROLLED_FIELDS
    }


def routine_row_to_model(row: dict[str, Any]) -> Routine:
    data = row.get("data")

    if not isinstance(data, dict):
        raise RuntimeError("Unexpected Supabase response.")

    payload = _strip_client_controlled_fields(
        dict(data)
    )
    payload.setdefault("routineId", row.get("id"))
    payload.setdefault("createdAt", row.get("created_at"))
    payload.setdefault("updatedAt", row.get("updated_at"))

    return Routine.model_validate(payload)


def routine_to_storage_payload(routine: Routine) -> dict[str, Any]:
    return _strip_client_controlled_fields(
        routine.model_dump(
            exclude_none=True,
            exclude={
                "createdAt",
                "updatedAt",
            },
        )
    )


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


async def create_user_routine(
    user: AuthenticatedUser,
    routine: Routine,
) -> Routine:
    row = await create_routine(
        user,
        routine_to_storage_payload(routine),
    )

    return routine_row_to_model(row)


async def replace_user_routine(
    user: AuthenticatedUser,
    routine_id: str,
    routine: Routine,
) -> Routine | None:
    row = await replace_routine(
        user,
        routine_id,
        routine_to_storage_payload(routine),
    )

    if row is None:
        return None

    return routine_row_to_model(row)


async def delete_user_routine(
    user: AuthenticatedUser,
    routine_id: str,
) -> bool:
    return await delete_routine(user, routine_id)

async def get_user_active_routine(
    user: AuthenticatedUser,
) -> Routine | None:
    row = await get_active_routine(user)

    if row is None:
        return None

    routine_id = row.get("routine_id")
    if not routine_id:
        raise RuntimeError("Unexpected Supabase response.")

    routine_row = await get_routine_by_id(user, str(routine_id))

    if routine_row is None:
        return None

    return routine_row_to_model(routine_row)


async def activate_user_routine(
    user: AuthenticatedUser,
    routine_id: str,
) -> Routine | None:
    routine_row = await get_routine_by_id(user, routine_id)

    if routine_row is None:
        return None

    await set_active_routine(user, routine_id)

    return routine_row_to_model(routine_row)
