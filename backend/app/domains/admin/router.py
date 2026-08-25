import os
from typing import Literal

import httpx
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from pydantic import BaseModel

from app.core.auth import (
    AuthenticatedUser,
    require_user,
)


router = APIRouter(
    prefix="/admin",
    tags=["Admin"],
)


class AccessRequestUpdate(BaseModel):
    status: Literal[
        "active",
        "rejected",
    ]


def require_admin(
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> AuthenticatedUser:
    if user.role != "admin":
        raise HTTPException(
            status_code=(
                status.HTTP_403_FORBIDDEN
            ),
            detail="Admin access required",
        )

    return user


def _supabase_config() -> tuple[str, str]:
    supabase_url = os.getenv(
        "SUPABASE_URL",
        "",
    ).rstrip("/")

    publishable_key = os.getenv(
        "SUPABASE_PUBLISHABLE_KEY",
        "",
    )

    if (
        not supabase_url
        or not publishable_key
    ):
        raise HTTPException(
            status_code=(
                status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail=(
                "Aptus authorization "
                "service is not configured"
            ),
        )

    return (
        supabase_url,
        publishable_key,
    )


def _headers(
    user: AuthenticatedUser,
) -> dict[str, str]:
    if not user.access_token:
        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
            ),
            detail="Missing access token",
        )

    _, publishable_key = (
        _supabase_config()
    )

    return {
        "Authorization":
            f"Bearer {user.access_token}",
        "apikey":
            publishable_key,
        "Content-Type":
            "application/json",
    }


@router.get(
    "/access-requests",
)
async def list_access_requests(
    user: AuthenticatedUser = Depends(
        require_admin
    ),
) -> list[dict]:
    supabase_url, _ = (
        _supabase_config()
    )

    try:
        async with httpx.AsyncClient(
            timeout=10.0
        ) as client:
            response = await client.get(
                (
                    f"{supabase_url}"
                    "/rest/v1/gymos_users"
                ),
                headers=_headers(user),
                params={
                    "status": "eq.pending",
                    "select": (
                        "user_id,"
                        "email,"
                        "status,"
                        "plan,"
                        "role,"
                        "created_at,"
                        "updated_at"
                    ),
                    "order":
                        "created_at.asc",
                },
            )

    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail=(
                "Aptus authorization "
                "service is unavailable"
            ),
        ) from exc

    if response.status_code != 200:
        raise HTTPException(
            status_code=(
                status.HTTP_502_BAD_GATEWAY
            ),
            detail=(
                "Could not load "
                "access requests"
            ),
        )

    rows = response.json()

    if not isinstance(rows, list):
        return []

    return rows


@router.patch(
    "/access-requests/{user_id}",
)
async def update_access_request(
    user_id: str,
    update: AccessRequestUpdate,
    user: AuthenticatedUser = Depends(
        require_admin
    ),
) -> dict:
    supabase_url, _ = (
        _supabase_config()
    )

    headers = _headers(user)
    headers["Prefer"] = (
        "return=representation"
    )

    try:
        async with httpx.AsyncClient(
            timeout=10.0
        ) as client:
            response = await client.patch(
                (
                    f"{supabase_url}"
                    "/rest/v1/gymos_users"
                ),
                headers=headers,
                params={
                    "user_id":
                        f"eq.{user_id}",
                    "status":
                        "eq.pending",
                    "select": (
                        "user_id,"
                        "email,"
                        "status,"
                        "plan,"
                        "role,"
                        "created_at,"
                        "updated_at"
                    ),
                },
                json={
                    "status":
                        update.status,
                },
            )

    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail=(
                "Aptus authorization "
                "service is unavailable"
            ),
        ) from exc

    if response.status_code not in {
        200,
        204,
    }:
        raise HTTPException(
            status_code=(
                status.HTTP_502_BAD_GATEWAY
            ),
            detail=(
                "Could not update "
                "access request"
            ),
        )

    rows = response.json()

    if (
        not isinstance(rows, list)
        or not rows
    ):
        raise HTTPException(
            status_code=(
                status.HTTP_404_NOT_FOUND
            ),
            detail=(
                "Pending access request "
                "not found"
            ),
        )

    return rows[0]
