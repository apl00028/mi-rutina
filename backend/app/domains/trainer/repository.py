from typing import Any

import httpx
import os

from app.core.auth import AuthenticatedUser


class SupabaseConfigError(RuntimeError):
    pass


def _supabase_config() -> tuple[str, str]:
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")

    if not url or not key:
        raise SupabaseConfigError(
            "Supabase is not configured."
        )

    return url, key


async def list_active_trainer_athletes(
    trainer: AuthenticatedUser,
) -> list[dict[str, Any]]:
    url, key = _supabase_config()

    headers = {
        "Authorization":
            f"Bearer {trainer.access_token}",
        "apikey":
            key,
    }

    params = {
        "trainer_id":
            f"eq.{trainer.id}",
        "status":
            "eq.active",
        "select":
            "athlete_id,status",
        "order":
            "created_at.asc",
    }

    async with httpx.AsyncClient(
        timeout=10.0
    ) as client:
        response = await client.get(
            f"{url}/rest/v1/trainer_athletes",
            headers=headers,
            params=params,
        )

    response.raise_for_status()

    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError(
            "Unexpected Supabase response."
        )

    return data
