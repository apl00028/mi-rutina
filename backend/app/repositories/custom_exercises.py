import os
from typing import Any

import httpx

from auth import AuthenticatedUser
from app.models.custom_exercise import CustomExerciseCreate


def _supabase_config() -> tuple[str, str]:
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")

    if not url or not key:
        raise RuntimeError("Supabase is not configured.")

    return url, key


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
