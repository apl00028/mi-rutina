from typing import Any

from app.core.auth import AuthenticatedUser
from app.core.http_client import (
    get_supabase_http_client,
)
from app.domains.exercises.custom_repository import (
    _supabase_config,
)


PROVIDER = "health_connect"


def _headers(
    user: AuthenticatedUser,
) -> dict[str, str]:
    _, key = _supabase_config()

    return {
        "Authorization":
            f"Bearer {user.access_token}",
        "apikey": key,
        "Content-Type": "application/json",
    }


async def get_health_connect_integration(
    user: AuthenticatedUser,
) -> dict[str, Any] | None:
    url, _ = _supabase_config()

    response = (
        await get_supabase_http_client().get(
            f"{url}/rest/v1/user_integrations",
            headers=_headers(user),
            params={
                "user_id": f"eq.{user.id}",
                "provider": f"eq.{PROVIDER}",
                "select":
                    "user_id,provider,enabled,"
                    "connected_at,updated_at",
                "limit": "1",
            },
        )
    )

    response.raise_for_status()

    rows = response.json()

    if not isinstance(rows, list):
        raise RuntimeError(
            "Unexpected integrations response."
        )

    if not rows:
        return None

    row = rows[0]

    if (
        not isinstance(row, dict)
        or row.get("user_id") != user.id
        or row.get("provider") != PROVIDER
    ):
        raise RuntimeError(
            "Unexpected integration owner."
        )

    return row


async def connect_health_connect(
    user: AuthenticatedUser,
) -> dict[str, Any]:
    url, _ = _supabase_config()

    headers = _headers(user)
    headers["Prefer"] = (
        "resolution=merge-duplicates,"
        "return=representation"
    )

    response = (
        await get_supabase_http_client().post(
            f"{url}/rest/v1/user_integrations",
            headers=headers,
            params={
                "on_conflict":
                    "user_id,provider",
            },
            json={
                "user_id": user.id,
                "provider": PROVIDER,
                "enabled": True,
            },
        )
    )

    response.raise_for_status()

    rows = response.json()

    if (
        not isinstance(rows, list)
        or len(rows) != 1
        or not isinstance(rows[0], dict)
        or rows[0].get("user_id") != user.id
    ):
        raise RuntimeError(
            "Unexpected integration response."
        )

    return rows[0]


async def disconnect_health_connect(
    user: AuthenticatedUser,
) -> None:
    url, _ = _supabase_config()

    response = (
        await get_supabase_http_client().delete(
            f"{url}/rest/v1/user_integrations",
            headers=_headers(user),
            params={
                "user_id": f"eq.{user.id}",
                "provider": f"eq.{PROVIDER}",
            },
        )
    )

    response.raise_for_status()
