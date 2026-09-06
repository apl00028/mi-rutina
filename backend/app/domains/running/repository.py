from typing import Any

from app.core.auth import AuthenticatedUser
from app.core.http_client import get_supabase_http_client
from app.domains.exercises.custom_repository import _supabase_config


async def upsert_running_session(
    user: AuthenticatedUser, payload: dict[str, Any],
) -> dict[str, Any]:
    url, key = _supabase_config()
    response = await get_supabase_http_client().post(
        f"{url}/rest/v1/rpc/upsert_my_running_session",
        headers={"Authorization": f"Bearer {user.access_token}", "apikey": key},
        json={"p_session": payload},
    )
    response.raise_for_status()
    rows = response.json()
    if not isinstance(rows, list) or len(rows) != 1 or not isinstance(rows[0], dict):
        raise RuntimeError("Unexpected Supabase response.")
    if rows[0].get("user_id") != user.id:
        raise RuntimeError("Unexpected running session owner.")
    return rows[0]


async def list_running_sessions(user: AuthenticatedUser) -> list[dict[str, Any]]:
    url, key = _supabase_config()
    response = await get_supabase_http_client().get(
        f"{url}/rest/v1/running_sessions",
        headers={"Authorization": f"Bearer {user.access_token}", "apikey": key},
        params={"user_id": f"eq.{user.id}", "order": "started_at.desc,id.desc"},
    )
    response.raise_for_status()
    rows = response.json()
    if not isinstance(rows, list) or any(
        not isinstance(row, dict) or row.get("user_id") != user.id for row in rows
    ):
        raise RuntimeError("Unexpected Supabase response.")
    return rows
