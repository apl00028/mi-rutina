from typing import Any

import httpx

from auth import AuthenticatedUser
from app.repositories.custom_exercises import _supabase_config


async def list_routines(
    user: AuthenticatedUser,
) -> list[dict[str, Any]]:
    url, key = _supabase_config()

    headers = {
        "Authorization": f"Bearer {user.access_token}",
        "apikey": key,
    }

    params = {
        "user_id": f"eq.{user.id}",
        "order": "updated_at.desc",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{url}/rest/v1/routines",
            headers=headers,
            params=params,
        )

    response.raise_for_status()

    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError("Unexpected Supabase response.")

    return data


async def get_routine_by_id(
    user: AuthenticatedUser,
    routine_id: str,
) -> dict[str, Any] | None:
    url, key = _supabase_config()

    headers = {
        "Authorization": f"Bearer {user.access_token}",
        "apikey": key,
    }

    params = {
        "id": f"eq.{routine_id}",
        "user_id": f"eq.{user.id}",
        "limit": "1",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{url}/rest/v1/routines",
            headers=headers,
            params=params,
        )

    response.raise_for_status()

    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError("Unexpected Supabase response.")

    return data[0] if data else None
