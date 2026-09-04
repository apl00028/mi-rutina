from typing import Any

from app.core.auth import AuthenticatedUser
from app.core.http_client import get_supabase_http_client
from app.domains.exercises.custom_repository import (
    _supabase_config,
)


async def list_swimming_sessions(
    user: AuthenticatedUser,
) -> list[dict[str, Any]]:
    url, key = _supabase_config()

    headers = {
        "Authorization":
            f"Bearer {user.access_token}",
        "apikey": key,
    }

    params = {
        "user_id": f"eq.{user.id}",
        "order": "started_at.desc",
    }

    client = get_supabase_http_client()

    response = await client.get(
        f"{url}/rest/v1/swimming_sessions",
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


async def get_swimming_session_by_hash(
    user: AuthenticatedUser,
    source_file_hash: str,
) -> dict[str, Any] | None:
    url, key = _supabase_config()

    headers = {
        "Authorization": f"Bearer {user.access_token}",
        "apikey": key,
    }

    params = {
        "user_id": f"eq.{user.id}",
        "source_file_hash": f"eq.{source_file_hash}",
        "limit": "1",
    }

    client = get_supabase_http_client()

    response = await client.get(
        f"{url}/rest/v1/swimming_sessions",
        headers=headers,
        params=params,
    )

    response.raise_for_status()

    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError(
            "Unexpected Supabase response."
        )

    return data[0] if data else None


async def create_swimming_session(
    user: AuthenticatedUser,
    payload: dict[str, Any],
) -> dict[str, Any]:
    url, key = _supabase_config()

    headers = {
        "Authorization":
            f"Bearer {user.access_token}",
        "apikey": key,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    row = {
        "id": payload["id"],
        "user_id": user.id,
        "source": payload["source"],
        "source_file_hash":
            payload["source_file_hash"],
        "started_at": payload["started_at"],
        "parser_version":
            payload["parser_version"],
        "data": payload["data"],
    }

    client = get_supabase_http_client()

    response = await client.post(
        f"{url}/rest/v1/swimming_sessions",
        headers=headers,
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


async def upsert_swimming_sessions(
    user: AuthenticatedUser,
    payloads: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not payloads:
        return []

    url, key = _supabase_config()

    headers = {
        "Authorization":
            f"Bearer {user.access_token}",
        "apikey": key,
        "Content-Type": "application/json",
        "Prefer": (
            "resolution=merge-duplicates,"
            "return=representation"
        ),
    }

    rows = [
        {
            "id": payload["id"],
            "user_id": user.id,
            "source": payload["source"],
            "source_file_hash":
                payload["source_file_hash"],
            "started_at": payload["started_at"],
            "parser_version":
                payload["parser_version"],
            "data": payload["data"],
            "updated_at": payload["updated_at"],
        }
        for payload in payloads
    ]

    client = get_supabase_http_client()

    response = await client.post(
        f"{url}/rest/v1/swimming_sessions",
        headers=headers,
        params={
            "on_conflict":
                "user_id,id",
        },
        json=rows,
    )

    response.raise_for_status()

    data = response.json()

    if not isinstance(data, list):
        raise RuntimeError(
            "Unexpected Supabase response."
        )

    return data
