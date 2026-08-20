import os
from typing import Any
from uuid import UUID

import httpx

from app.core.auth import AuthenticatedUser
from app.domains.exercises.schemas import CustomExerciseCreate


class SupabaseConfigError(RuntimeError):
    pass


def _supabase_config() -> tuple[str, str]:
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")

    if not url or not key:
        raise SupabaseConfigError("Supabase is not configured.")

    return url, key


def _custom_uuid_from_public_id(exercise_id: str) -> str | None:
    if not exercise_id.startswith("custom-"):
        return None

    custom_id = exercise_id.removeprefix("custom-")

    try:
        return str(UUID(custom_id))
    except ValueError:
        return None


async def create_custom_exercise(
    user: AuthenticatedUser,
    exercise: CustomExerciseCreate,
) -> dict[str, Any]:
    url, key = _supabase_config()

    payload = {
        "user_id": user.id,
        "name": exercise.name.strip(),
        "muscle": exercise.muscle.strip(),
        "equipment": exercise.equipment.strip(),
        "type": exercise.type.strip(),
        "notes": exercise.notes,
        "category": exercise.category.strip(),
        "record_types": exercise.recordTypes,
    }

    headers = {
        "Authorization": f"Bearer {user.access_token}",
        "apikey": key,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{url}/rest/v1/custom_exercises",
            headers=headers,
            json=payload,
        )

    response.raise_for_status()

    data = response.json()

    if not isinstance(data, list) or len(data) != 1:
        raise RuntimeError("Unexpected Supabase response.")

    return data[0]


async def list_custom_exercises(
    user: AuthenticatedUser,
) -> list[dict[str, Any]]:
    url, key = _supabase_config()

    headers = {
        "Authorization": f"Bearer {user.access_token}",
        "apikey": key,
    }

    params = {
        "user_id": f"eq.{user.id}",
        "order": "created_at.asc",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{url}/rest/v1/custom_exercises",
            headers=headers,
            params=params,
        )

    response.raise_for_status()

    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError("Unexpected Supabase response.")

    return data


async def get_custom_exercise_by_id(
    user: AuthenticatedUser,
    exercise_id: str,
) -> dict[str, Any] | None:
    custom_id = _custom_uuid_from_public_id(exercise_id)
    if custom_id is None:
        return None

    url, key = _supabase_config()

    headers = {
        "Authorization": f"Bearer {user.access_token}",
        "apikey": key,
    }

    params = {
        "id": f"eq.{custom_id}",
        "user_id": f"eq.{user.id}",
        "limit": "1",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{url}/rest/v1/custom_exercises",
            headers=headers,
            params=params,
        )

    response.raise_for_status()

    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError("Unexpected Supabase response.")

    return data[0] if data else None


async def update_custom_exercise(
    user: AuthenticatedUser,
    exercise_id: str,
    changes: dict[str, Any],
) -> dict[str, Any] | None:
    custom_id = _custom_uuid_from_public_id(exercise_id)
    if custom_id is None:
        return None

    url, key = _supabase_config()

    payload = {}
    for key_name, value in changes.items():
        column = "record_types" if key_name == "recordTypes" else key_name
        payload[column] = value.strip() if isinstance(value, str) else value

    headers = {
        "Authorization": f"Bearer {user.access_token}",
        "apikey": key,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    params = {
        "id": f"eq.{custom_id}",
        "user_id": f"eq.{user.id}",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.patch(
            f"{url}/rest/v1/custom_exercises",
            headers=headers,
            params=params,
            json=payload,
        )

    response.raise_for_status()

    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError("Unexpected Supabase response.")

    return data[0] if data else None


async def delete_custom_exercise(
    user: AuthenticatedUser,
    exercise_id: str,
) -> bool:
    custom_id = _custom_uuid_from_public_id(exercise_id)
    if custom_id is None:
        return False

    url, key = _supabase_config()

    headers = {
        "Authorization": f"Bearer {user.access_token}",
        "apikey": key,
        "Prefer": "return=representation",
    }

    params = {
        "id": f"eq.{custom_id}",
        "user_id": f"eq.{user.id}",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.delete(
            f"{url}/rest/v1/custom_exercises",
            headers=headers,
            params=params,
        )

    response.raise_for_status()

    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError("Unexpected Supabase response.")

    return bool(data)
