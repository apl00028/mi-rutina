from datetime import datetime, timezone
import os
from typing import Any

import httpx

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


def _template_headers(
    trainer: AuthenticatedUser,
    *,
    write: bool = False,
) -> dict[str, str]:
    _, key = _supabase_config()

    headers = {
        "Authorization":
            f"Bearer {trainer.access_token}",
        "apikey":
            key,
    }

    if write:
        headers.update(
            {
                "Content-Type":
                    "application/json",
                "Prefer":
                    "return=representation",
            }
        )

    return headers


def _template_select() -> str:
    return (
        "id,name,discipline,data,"
        "created_at,updated_at"
    )


async def list_routine_templates(
    trainer: AuthenticatedUser,
    discipline: str | None = None,
) -> list[dict[str, Any]]:
    url, _ = _supabase_config()

    params = {
        "trainer_id":
            f"eq.{trainer.id}",
        "select":
            _template_select(),
        "order":
            "updated_at.desc",
    }

    if discipline is not None:
        params["discipline"] = (
            f"eq.{discipline}"
        )

    async with httpx.AsyncClient(
        timeout=10.0
    ) as client:
        response = await client.get(
            (
                f"{url}/rest/v1/"
                "trainer_routine_templates"
            ),
            headers=_template_headers(
                trainer
            ),
            params=params,
        )

    response.raise_for_status()

    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError(
            "Unexpected Supabase response."
        )

    return data


async def get_routine_template_by_id(
    trainer: AuthenticatedUser,
    template_id: str,
) -> dict[str, Any] | None:
    url, _ = _supabase_config()

    params = {
        "trainer_id":
            f"eq.{trainer.id}",
        "id":
            f"eq.{template_id}",
        "select":
            _template_select(),
        "limit":
            "1",
    }

    async with httpx.AsyncClient(
        timeout=10.0
    ) as client:
        response = await client.get(
            (
                f"{url}/rest/v1/"
                "trainer_routine_templates"
            ),
            headers=_template_headers(
                trainer
            ),
            params=params,
        )

    response.raise_for_status()

    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError(
            "Unexpected Supabase response."
        )

    return data[0] if data else None


async def create_routine_template(
    trainer: AuthenticatedUser,
    template: dict[str, Any],
) -> dict[str, Any]:
    url, _ = _supabase_config()

    payload = {
        "id":
            template["id"],
        "trainer_id":
            trainer.id,
        "name":
            template["name"],
        "discipline":
            template["discipline"],
        "data":
            template["data"],
    }

    params = {
        "select":
            _template_select(),
    }

    async with httpx.AsyncClient(
        timeout=10.0
    ) as client:
        response = await client.post(
            (
                f"{url}/rest/v1/"
                "trainer_routine_templates"
            ),
            headers=_template_headers(
                trainer,
                write=True,
            ),
            params=params,
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


async def replace_routine_template(
    trainer: AuthenticatedUser,
    template_id: str,
    template: dict[str, Any],
) -> dict[str, Any] | None:
    url, _ = _supabase_config()

    params = {
        "trainer_id":
            f"eq.{trainer.id}",
        "id":
            f"eq.{template_id}",
        "select":
            _template_select(),
    }

    payload = {
        "name":
            template["name"],
        "discipline":
            template["discipline"],
        "data":
            template["data"],
        "updated_at":
            datetime.now(
                timezone.utc
            ).isoformat().replace(
                "+00:00",
                "Z",
            ),
    }

    async with httpx.AsyncClient(
        timeout=10.0
    ) as client:
        response = await client.patch(
            (
                f"{url}/rest/v1/"
                "trainer_routine_templates"
            ),
            headers=_template_headers(
                trainer,
                write=True,
            ),
            params=params,
            json=payload,
        )

    response.raise_for_status()

    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError(
            "Unexpected Supabase response."
        )

    return data[0] if data else None


async def delete_routine_template(
    trainer: AuthenticatedUser,
    template_id: str,
) -> bool:
    url, _ = _supabase_config()

    headers = _template_headers(
        trainer
    )
    headers["Prefer"] = (
        "return=representation"
    )

    params = {
        "trainer_id":
            f"eq.{trainer.id}",
        "id":
            f"eq.{template_id}",
        "select":
            "id",
    }

    async with httpx.AsyncClient(
        timeout=10.0
    ) as client:
        response = await client.delete(
            (
                f"{url}/rest/v1/"
                "trainer_routine_templates"
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

    return bool(data)
