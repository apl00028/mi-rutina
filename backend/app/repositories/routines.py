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


async def create_routine(
    user: AuthenticatedUser,
    routine: dict[str, Any],
) -> dict[str, Any]:
    url, key = _supabase_config()
    routine_id = routine["routineId"]

    headers = {
        "Authorization": f"Bearer {user.access_token}",
        "apikey": key,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    payload = {
        "id": routine_id,
        "user_id": user.id,
        "data": routine,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{url}/rest/v1/routines",
            headers=headers,
            json=payload,
        )

    response.raise_for_status()

    data = response.json()

    if not isinstance(data, list) or len(data) != 1:
        raise RuntimeError("Unexpected Supabase response.")

    return data[0]


async def replace_routine(
    user: AuthenticatedUser,
    routine_id: str,
    routine: dict[str, Any],
) -> dict[str, Any] | None:
    url, key = _supabase_config()

    headers = {
        "Authorization": f"Bearer {user.access_token}",
        "apikey": key,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    params = {
        "id": f"eq.{routine_id}",
        "user_id": f"eq.{user.id}",
    }

    payload = {
        "data": routine,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.patch(
            f"{url}/rest/v1/routines",
            headers=headers,
            params=params,
            json=payload,
        )

    response.raise_for_status()
    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError("Unexpected Supabase response.")

    return data[0] if data else None


async def delete_routine(
    user: AuthenticatedUser,
    routine_id: str,
) -> bool:
    url, key = _supabase_config()

    headers = {
        "Authorization": f"Bearer {user.access_token}",
        "apikey": key,
        "Prefer": "return=representation",
    }

    params = {
        "id": f"eq.{routine_id}",
        "user_id": f"eq.{user.id}",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.delete(
            f"{url}/rest/v1/routines",
            headers=headers,
            params=params,
        )

    response.raise_for_status()

    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError("Unexpected Supabase response.")

    return len(data) > 0

async def get_active_routine(
    user: AuthenticatedUser,
) -> dict[str, Any] | None:
    url, key = _supabase_config()

    headers = {
        "Authorization": f"Bearer {user.access_token}",
        "apikey": key,
    }

    params = {
        "user_id": f"eq.{user.id}",
        "limit": "1",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{url}/rest/v1/active_routines",
            headers=headers,
            params=params,
        )

    response.raise_for_status()

    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError("Unexpected Supabase response.")

    return data[0] if data else None


async def set_active_routine(
    user: AuthenticatedUser,
    routine_id: str,
) -> dict[str, Any]:
    url, key = _supabase_config()

    headers = {
        "Authorization": f"Bearer {user.access_token}",
        "apikey": key,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation",
    }

    payload = {
        "user_id": user.id,
        "routine_id": routine_id,
    }

    params = {
        "on_conflict": "user_id",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{url}/rest/v1/active_routines",
            headers=headers,
            params=params,
            json=payload,
        )

    response.raise_for_status()

    data = response.json()

    if not isinstance(data, list) or len(data) != 1:
        raise RuntimeError("Unexpected Supabase response.")

    return data[0]