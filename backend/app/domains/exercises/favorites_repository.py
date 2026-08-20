from typing import Any

import httpx

from app.core.auth import AuthenticatedUser
from app.domains.exercises.custom_repository import _supabase_config


async def list_favorite_exercise_ids(
    user: AuthenticatedUser,
) -> set[str]:
    url, key = _supabase_config()

    headers = {
        "Authorization": f"Bearer {user.access_token}",
        "apikey": key,
    }

    params = {
        "select": "exercise_id",
        "user_id": f"eq.{user.id}",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{url}/rest/v1/exercise_favorites",
            headers=headers,
            params=params,
        )

    response.raise_for_status()

    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError("Unexpected Supabase response.")

    return {
        row["exercise_id"]
        for row in data
        if isinstance(row, dict) and isinstance(row.get("exercise_id"), str)
    }


async def add_favorite(
    user: AuthenticatedUser,
    exercise_id: str,
) -> None:
    url, key = _supabase_config()

    headers = {
        "Authorization": f"Bearer {user.access_token}",
        "apikey": key,
        "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates",
    }

    params = {
        "on_conflict": "user_id,exercise_id",
    }

    payload: dict[str, Any] = {
        "user_id": user.id,
        "exercise_id": exercise_id,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{url}/rest/v1/exercise_favorites",
            headers=headers,
            params=params,
            json=payload,
        )

    response.raise_for_status()


async def remove_favorite(
    user: AuthenticatedUser,
    exercise_id: str,
) -> None:
    url, key = _supabase_config()

    headers = {
        "Authorization": f"Bearer {user.access_token}",
        "apikey": key,
    }

    params = {
        "user_id": f"eq.{user.id}",
        "exercise_id": f"eq.{exercise_id}",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.delete(
            f"{url}/rest/v1/exercise_favorites",
            headers=headers,
            params=params,
        )

    response.raise_for_status()
