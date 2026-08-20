from app.core.auth import AuthenticatedUser
from app.domains.exercises.favorites_repository import (
    add_favorite,
    list_favorite_exercise_ids,
    remove_favorite,
)


async def list_user_favorite_exercise_ids(
    user: AuthenticatedUser,
) -> set[str]:
    return await list_favorite_exercise_ids(user)


async def mark_exercise_favorite(
    user: AuthenticatedUser,
    exercise_id: str,
) -> None:
    await add_favorite(user, exercise_id)


async def unmark_exercise_favorite(
    user: AuthenticatedUser,
    exercise_id: str,
) -> None:
    await remove_favorite(user, exercise_id)
