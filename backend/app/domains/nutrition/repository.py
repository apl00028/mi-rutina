from datetime import date
from typing import Any

import httpx

from app.core.auth import AuthenticatedUser
from app.core.http_client import (
    get_supabase_http_client,
)
from app.domains.exercises.custom_repository import _supabase_config


async def list_nutrition_plans(
    user: AuthenticatedUser,
) -> list[dict[str, Any]]:
    url, key = _supabase_config()

    headers = {
        "Authorization": f"Bearer {user.access_token}",
        "apikey": key,
    }

    params = {
        "user_id": f"eq.{user.id}",
        "order": "week_start.desc",
    }

    client = get_supabase_http_client()

    response = await client.get(
        f"{url}/rest/v1/nutrition_plans",
        headers=headers,
        params=params,
    )

    response.raise_for_status()
    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError("Unexpected Supabase response.")

    return data


async def get_nutrition_plan_by_id(
    user: AuthenticatedUser,
    plan_id: str,
) -> dict[str, Any] | None:
    url, key = _supabase_config()

    headers = {
        "Authorization": f"Bearer {user.access_token}",
        "apikey": key,
    }

    params = {
        "id": f"eq.{plan_id}",
        "user_id": f"eq.{user.id}",
        "limit": "1",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{url}/rest/v1/nutrition_plans",
            headers=headers,
            params=params,
        )

    response.raise_for_status()
    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError("Unexpected Supabase response.")

    return data[0] if data else None


async def get_nutrition_plan_by_week(
    user: AuthenticatedUser,
    week_start: date,
) -> dict[str, Any] | None:
    url, key = _supabase_config()

    headers = {
        "Authorization": f"Bearer {user.access_token}",
        "apikey": key,
    }

    params = {
        "user_id": f"eq.{user.id}",
        "week_start": f"eq.{week_start.isoformat()}",
        "limit": "1",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{url}/rest/v1/nutrition_plans",
            headers=headers,
            params=params,
        )

    response.raise_for_status()
    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError("Unexpected Supabase response.")

    return data[0] if data else None


async def create_nutrition_plan(
    user: AuthenticatedUser,
    plan: dict[str, Any],
) -> dict[str, Any]:
    url, key = _supabase_config()

    headers = {
        "Authorization": f"Bearer {user.access_token}",
        "apikey": key,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    payload = {
        "id": plan["planId"],
        "user_id": user.id,
        "week_start": plan["weekStart"],
        "status": plan["status"],
        "data": plan,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{url}/rest/v1/nutrition_plans",
            headers=headers,
            json=payload,
        )

    response.raise_for_status()
    data = response.json()

    if not isinstance(data, list) or len(data) != 1:
        raise RuntimeError("Unexpected Supabase response.")

    return data[0]


async def replace_nutrition_plan(
    user: AuthenticatedUser,
    plan_id: str,
    plan: dict[str, Any],
) -> dict[str, Any] | None:
    url, key = _supabase_config()

    headers = {
        "Authorization": f"Bearer {user.access_token}",
        "apikey": key,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    params = {
        "id": f"eq.{plan_id}",
        "user_id": f"eq.{user.id}",
    }

    payload = {
        "week_start": plan["weekStart"],
        "status": plan["status"],
        "data": plan,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.patch(
            f"{url}/rest/v1/nutrition_plans",
            headers=headers,
            params=params,
            json=payload,
        )

    response.raise_for_status()
    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError("Unexpected Supabase response.")

    return data[0] if data else None


async def delete_nutrition_plan(
    user: AuthenticatedUser,
    plan_id: str,
) -> bool:
    url, key = _supabase_config()

    headers = {
        "Authorization": f"Bearer {user.access_token}",
        "apikey": key,
        "Prefer": "return=representation",
    }

    params = {
        "id": f"eq.{plan_id}",
        "user_id": f"eq.{user.id}",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.delete(
            f"{url}/rest/v1/nutrition_plans",
            headers=headers,
            params=params,
        )

    response.raise_for_status()
    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError("Unexpected Supabase response.")

    return bool(data)



async def list_nutrition_meal_completions(
    user: AuthenticatedUser,
    plan_id: str,
) -> list[dict[str, Any]]:
    url, key = _supabase_config()

    headers = {
        "Authorization":
            f"Bearer {user.access_token}",
        "apikey": key,
    }

    params = {
        "user_id": f"eq.{user.id}",
        "plan_id": f"eq.{plan_id}",
        "order": "meal_date.asc",
    }

    async with httpx.AsyncClient(
        timeout=10.0
    ) as client:
        response = await client.get(
            (
                f"{url}/rest/v1/"
                "nutrition_meal_completions"
            ),
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


async def upsert_nutrition_meal_completion(
    user: AuthenticatedUser,
    plan_id: str,
    meal_date: date,
    meal_id: str,
) -> dict[str, Any]:
    url, key = _supabase_config()

    headers = {
        "Authorization":
            f"Bearer {user.access_token}",
        "apikey": key,
        "Content-Type":
            "application/json",
        "Prefer": (
            "resolution=merge-duplicates,"
            "return=representation"
        ),
    }

    payload = {
        "user_id": user.id,
        "plan_id": plan_id,
        "meal_date": meal_date.isoformat(),
        "meal_id": meal_id,
    }

    async with httpx.AsyncClient(
        timeout=10.0
    ) as client:
        response = await client.post(
            (
                f"{url}/rest/v1/"
                "nutrition_meal_completions"
            ),
            headers=headers,
            params={
                "on_conflict":
                    "user_id,plan_id,meal_id"
            },
            json=payload,
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


async def delete_nutrition_meal_completion(
    user: AuthenticatedUser,
    plan_id: str,
    meal_id: str,
) -> bool:
    url, key = _supabase_config()

    headers = {
        "Authorization":
            f"Bearer {user.access_token}",
        "apikey": key,
        "Prefer":
            "return=representation",
    }

    async with httpx.AsyncClient(
        timeout=10.0
    ) as client:
        response = await client.delete(
            (
                f"{url}/rest/v1/"
                "nutrition_meal_completions"
            ),
            headers=headers,
            params={
                "user_id":
                    f"eq.{user.id}",
                "plan_id":
                    f"eq.{plan_id}",
                "meal_id":
                    f"eq.{meal_id}",
            },
        )

    response.raise_for_status()
    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError(
            "Unexpected Supabase response."
        )

    return bool(data)
