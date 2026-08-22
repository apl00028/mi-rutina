from datetime import date
from typing import Any

import httpx

from app.core.auth import AuthenticatedUser
from app.domains.exercises.custom_repository import (
    _supabase_config,
)


def _headers(
    user: AuthenticatedUser,
    *,
    prefer: str | None = None,
) -> dict[str, str]:
    _, key = _supabase_config()

    headers = {
        "Authorization":
            f"Bearer {user.access_token}",
        "apikey":
            key,
    }

    if prefer:
        headers["Prefer"] = prefer

    return headers


async def list_weight_entries(
    user: AuthenticatedUser,
) -> list[dict[str, Any]]:
    url, _ = _supabase_config()

    async with httpx.AsyncClient(
        timeout=10.0
    ) as client:
        response = await client.get(
            (
                f"{url}/rest/v1/"
                "health_weight_entries"
            ),
            headers=_headers(user),
            params={
                "user_id":
                    f"eq.{user.id}",
                "order":
                    "measurement_date.desc",
            },
        )

    response.raise_for_status()
    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError(
            "Unexpected Supabase response."
        )

    return data


async def upsert_weight_entry(
    user: AuthenticatedUser,
    measurement_date: date,
    payload: dict[str, Any],
) -> dict[str, Any]:
    url, _ = _supabase_config()

    row = {
        "user_id":
            user.id,
        "measurement_date":
            measurement_date.isoformat(),
        "weight_kg":
            payload["weightKg"],
        "body_fat_percent":
            payload.get(
                "bodyFatPercent"
            ),
        "muscle_mass_kg":
            payload.get(
                "muscleMassKg"
            ),
        "body_water_percent":
            payload.get(
                "bodyWaterPercent"
            ),
        "visceral_fat_index":
            payload.get(
                "visceralFatIndex"
            ),
        "source":
            payload.get(
                "source",
                "manual",
            ),
        "notes":
            payload.get("notes"),
    }

    async with httpx.AsyncClient(
        timeout=10.0
    ) as client:
        response = await client.post(
            (
                f"{url}/rest/v1/"
                "health_weight_entries"
            ),
            headers=_headers(
                user,
                prefer=(
                    "resolution=merge-duplicates,"
                    "return=representation"
                ),
            ),
            params={
                "on_conflict":
                    "user_id,measurement_date",
            },
            json=row,
        )

    response.raise_for_status()
    data = response.json()

    if (
        not isinstance(data, list)
        or len(data) != 1
    ):
        raise RuntimeError(
            "Unexpected Supabase response."
        )

    return data[0]


async def delete_weight_entry(
    user: AuthenticatedUser,
    measurement_date: date,
) -> bool:
    url, _ = _supabase_config()

    async with httpx.AsyncClient(
        timeout=10.0
    ) as client:
        response = await client.delete(
            (
                f"{url}/rest/v1/"
                "health_weight_entries"
            ),
            headers=_headers(
                user,
                prefer="return=representation",
            ),
            params={
                "user_id":
                    f"eq.{user.id}",
                "measurement_date":
                    (
                        "eq."
                        f"{measurement_date.isoformat()}"
                    ),
            },
        )

    response.raise_for_status()
    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError(
            "Unexpected Supabase response."
        )

    return bool(data)


async def list_weekly_checkins(
    user: AuthenticatedUser,
) -> list[dict[str, Any]]:
    url, _ = _supabase_config()

    async with httpx.AsyncClient(
        timeout=10.0
    ) as client:
        response = await client.get(
            (
                f"{url}/rest/v1/"
                "health_weekly_checkins"
            ),
            headers=_headers(user),
            params={
                "user_id":
                    f"eq.{user.id}",
                "order":
                    "week_start.desc",
            },
        )

    response.raise_for_status()
    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError(
            "Unexpected Supabase response."
        )

    return data


async def upsert_weekly_checkin(
    user: AuthenticatedUser,
    week_start: date,
    payload: dict[str, Any],
) -> dict[str, Any]:
    url, _ = _supabase_config()

    row = {
        "user_id":
            user.id,
        "week_start":
            week_start.isoformat(),
        "fatigue":
            payload.get("fatigue"),
        "hunger":
            payload.get("hunger"),
        "recovery":
            payload.get("recovery"),
        "motivation":
            payload.get("motivation"),
        "waist_cm":
            payload.get("waistCm"),
        "diet_adherence_percent":
            payload.get(
                "dietAdherencePercent"
            ),
        "notes":
            payload.get("notes"),
    }

    async with httpx.AsyncClient(
        timeout=10.0
    ) as client:
        response = await client.post(
            (
                f"{url}/rest/v1/"
                "health_weekly_checkins"
            ),
            headers=_headers(
                user,
                prefer=(
                    "resolution=merge-duplicates,"
                    "return=representation"
                ),
            ),
            params={
                "on_conflict":
                    "user_id,week_start",
            },
            json=row,
        )

    response.raise_for_status()
    data = response.json()

    if (
        not isinstance(data, list)
        or len(data) != 1
    ):
        raise RuntimeError(
            "Unexpected Supabase response."
        )

    return data[0]



async def list_daily_checkins(
    user: AuthenticatedUser,
) -> list[dict[str, Any]]:
    url, _ = _supabase_config()

    async with httpx.AsyncClient(
        timeout=10.0
    ) as client:
        response = await client.get(
            (
                f"{url}/rest/v1/"
                "health_daily_checkins"
            ),
            headers=_headers(user),
            params={
                "user_id":
                    f"eq.{user.id}",
                "order":
                    "measurement_date.desc",
            },
        )

    response.raise_for_status()
    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError(
            "Unexpected Supabase response."
        )

    return data


async def upsert_daily_checkin(
    user: AuthenticatedUser,
    measurement_date: date,
    payload: dict[str, Any],
) -> dict[str, Any]:
    url, _ = _supabase_config()

    row = {
        "user_id":
            user.id,
        "measurement_date":
            measurement_date.isoformat(),
        "hunger":
            payload.get("hunger"),
        "diet_adherence_percent":
            payload.get(
                "dietAdherencePercent"
            ),
        "notes":
            payload.get("notes"),
    }

    async with httpx.AsyncClient(
        timeout=10.0
    ) as client:
        response = await client.post(
            (
                f"{url}/rest/v1/"
                "health_daily_checkins"
            ),
            headers=_headers(
                user,
                prefer=(
                    "resolution=merge-duplicates,"
                    "return=representation"
                ),
            ),
            params={
                "on_conflict":
                    "user_id,measurement_date",
            },
            json=row,
        )

    response.raise_for_status()
    data = response.json()

    if (
        not isinstance(data, list)
        or len(data) != 1
    ):
        raise RuntimeError(
            "Unexpected Supabase response."
        )

    return data[0]
