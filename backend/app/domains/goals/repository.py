from typing import Any

from app.core.auth import AuthenticatedUser
from app.core.http_client import (
    get_supabase_http_client,
)
from app.domains.exercises.custom_repository import (
    _supabase_config,
)


GOAL_COLUMNS = (
    "id,user_id,category,kind,variant,"
    "target_date,status,created_by_user_id,"
    "created_at,updated_at"
)

GOAL_METRIC_COLUMNS = (
    "id,goal_id,metric_key,target_value,"
    "created_at,updated_at"
)

GOAL_BASELINE_COLUMNS = (
    "id,goal_metric_id,value,measured_at,"
    "source_type,source_domain,source_record_id,"
    "created_at,updated_at"
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
        "apikey": key,
    }

    if prefer:
        headers["Prefer"] = prefer

    return headers


def _rows(response) -> list[dict[str, Any]]:
    response.raise_for_status()

    try:
        data = response.json()
    except ValueError as exc:
        raise RuntimeError(
            "Unexpected Supabase response."
        ) from exc

    if not isinstance(data, list):
        raise RuntimeError(
            "Unexpected Supabase response."
        )

    return data


async def get_active_goal(
    user: AuthenticatedUser,
) -> dict[str, Any] | None:
    url, _ = _supabase_config()
    response = await get_supabase_http_client().get(
        f"{url}/rest/v1/goals",
        headers=_headers(user),
        params={
            "select": GOAL_COLUMNS,
            "user_id": f"eq.{user.id}",
            "status": "eq.active",
            "limit": "1",
        },
    )
    rows = _rows(response)
    return rows[0] if rows else None


async def list_goals(
    user: AuthenticatedUser,
) -> list[dict[str, Any]]:
    url, _ = _supabase_config()
    response = await get_supabase_http_client().get(
        f"{url}/rest/v1/goals",
        headers=_headers(user),
        params={
            "select": GOAL_COLUMNS,
            "user_id": f"eq.{user.id}",
            "order": "created_at.desc",
        },
    )
    return _rows(response)


async def get_goal(
    user: AuthenticatedUser,
    goal_id: str,
) -> dict[str, Any] | None:
    url, _ = _supabase_config()
    response = await get_supabase_http_client().get(
        f"{url}/rest/v1/goals",
        headers=_headers(user),
        params={
            "select": GOAL_COLUMNS,
            "id": f"eq.{goal_id}",
            "user_id": f"eq.{user.id}",
            "limit": "1",
        },
    )
    rows = _rows(response)
    return rows[0] if rows else None


async def create_goal(
    user: AuthenticatedUser,
    payload: dict[str, Any],
) -> dict[str, Any]:
    url, _ = _supabase_config()
    row = {
        **payload,
        "user_id": user.id,
        "created_by_user_id": user.id,
        "status": "active",
    }
    response = await get_supabase_http_client().post(
        f"{url}/rest/v1/goals",
        headers=_headers(
            user,
            prefer="return=representation",
        ),
        params={"select": GOAL_COLUMNS},
        json=row,
    )
    rows = _rows(response)

    if len(rows) != 1:
        raise RuntimeError(
            "Unexpected Supabase response."
        )

    return rows[0]


async def update_goal(
    user: AuthenticatedUser,
    goal_id: str,
    payload: dict[str, Any],
    *,
    active_only: bool = False,
) -> dict[str, Any] | None:
    url, _ = _supabase_config()
    params = {
        "select": GOAL_COLUMNS,
        "id": f"eq.{goal_id}",
        "user_id": f"eq.{user.id}",
    }

    if active_only:
        params["status"] = "eq.active"

    response = await get_supabase_http_client().patch(
        f"{url}/rest/v1/goals",
        headers=_headers(
            user,
            prefer="return=representation",
        ),
        params=params,
        json=payload,
    )
    rows = _rows(response)
    return rows[0] if rows else None


async def list_goal_metrics(
    user: AuthenticatedUser,
    goal_id: str,
) -> list[dict[str, Any]]:
    url, _ = _supabase_config()
    response = await get_supabase_http_client().get(
        f"{url}/rest/v1/goal_metrics",
        headers=_headers(user),
        params={
            "select": GOAL_METRIC_COLUMNS,
            "goal_id": f"eq.{goal_id}",
            "order": "created_at.asc",
        },
    )
    return _rows(response)


async def get_goal_metric(
    user: AuthenticatedUser,
    goal_id: str,
    metric_id: str,
) -> dict[str, Any] | None:
    url, _ = _supabase_config()
    response = await get_supabase_http_client().get(
        f"{url}/rest/v1/goal_metrics",
        headers=_headers(user),
        params={
            "select": GOAL_METRIC_COLUMNS,
            "id": f"eq.{metric_id}",
            "goal_id": f"eq.{goal_id}",
            "limit": "1",
        },
    )
    rows = _rows(response)
    return rows[0] if rows else None


async def create_goal_metric(
    user: AuthenticatedUser,
    goal_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    url, _ = _supabase_config()
    response = await get_supabase_http_client().post(
        f"{url}/rest/v1/goal_metrics",
        headers=_headers(
            user,
            prefer="return=representation",
        ),
        params={"select": GOAL_METRIC_COLUMNS},
        json={**payload, "goal_id": goal_id},
    )
    rows = _rows(response)
    if len(rows) != 1:
        raise RuntimeError("Unexpected Supabase response.")
    return rows[0]


async def update_goal_metric_target(
    user: AuthenticatedUser,
    goal_id: str,
    metric_id: str,
    target_value: float | None,
) -> dict[str, Any] | None:
    url, _ = _supabase_config()
    response = await get_supabase_http_client().patch(
        f"{url}/rest/v1/goal_metrics",
        headers=_headers(
            user,
            prefer="return=representation",
        ),
        params={
            "select": GOAL_METRIC_COLUMNS,
            "id": f"eq.{metric_id}",
            "goal_id": f"eq.{goal_id}",
        },
        json={"target_value": target_value},
    )
    rows = _rows(response)
    return rows[0] if rows else None


async def list_metric_baselines(
    user: AuthenticatedUser,
    metric_ids: list[str],
) -> list[dict[str, Any]]:
    if not metric_ids:
        return []
    url, _ = _supabase_config()
    response = await get_supabase_http_client().get(
        f"{url}/rest/v1/goal_metric_baselines",
        headers=_headers(user),
        params={
            "select": GOAL_BASELINE_COLUMNS,
            "goal_metric_id": f"in.({','.join(metric_ids)})",
        },
    )
    return _rows(response)


async def upsert_metric_baseline(
    user: AuthenticatedUser,
    metric_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    url, _ = _supabase_config()
    response = await get_supabase_http_client().post(
        f"{url}/rest/v1/goal_metric_baselines",
        headers=_headers(
            user,
            prefer=(
                "resolution=merge-duplicates,"
                "return=representation"
            ),
        ),
        params={
            "select": GOAL_BASELINE_COLUMNS,
            "on_conflict": "goal_metric_id",
        },
        json={**payload, "goal_metric_id": metric_id},
    )
    rows = _rows(response)
    if len(rows) != 1:
        raise RuntimeError("Unexpected Supabase response.")
    return rows[0]
