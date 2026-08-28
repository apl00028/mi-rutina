import asyncio
import logging
import os

import httpx
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)

from app.core.http_client import (
    get_supabase_http_client,
)

from app.core.auth import (
    AuthenticatedUser,
    authenticate_user,
    get_gymos_access,
)

from app.domains.account.deletion_service import (
    delete_account,
)


logger = logging.getLogger(
    "uvicorn.error"
)


router = APIRouter(
    tags=["Account"]
)


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
                "Authentication service "
                "is not configured"
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


async def _get_onboarding_completed(
    user: AuthenticatedUser,
) -> bool:
    supabase_url, _ = (
        _supabase_config()
    )

    try:
        client = get_supabase_http_client()

        response = await client.get(
            (
                f"{supabase_url}"
                "/rest/v1/training_profiles"
            ),
            headers=_headers(user),
            params={
                "user_id":
                    f"eq.{user.id}",
                "select":
                    "onboarding_completed",
                "limit":
                    "1",
            },
        )

    except httpx.HTTPError as exc:
        logger.warning(
            "supabase_training_profile_request_failed "
            "error_type=%s cause_type=%s",
            type(exc).__name__,
            (
                type(exc.__cause__).__name__
                if exc.__cause__ is not None
                else "none"
            ),
        )

        raise HTTPException(
            status_code=(
                status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail=(
                "Training profile service "
                "is unavailable"
            ),
        ) from exc

    if response.status_code != 200:
        raise HTTPException(
            status_code=(
                status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail=(
                "Training profile service "
                "is unavailable"
            ),
        )

    rows = response.json()

    if not rows:
        return False

    return bool(
        rows[0].get(
            "onboarding_completed",
            False,
        )
    )


async def _ensure_training_profile(
    user: AuthenticatedUser,
) -> None:
    supabase_url, _ = (
        _supabase_config()
    )

    headers = _headers(user)

    headers["Prefer"] = (
        "resolution=ignore-duplicates,"
        "return=minimal"
    )

    try:
        async with httpx.AsyncClient(
            timeout=10.0
        ) as client:
            response = await client.post(
                (
                    f"{supabase_url}"
                    "/rest/v1/training_profiles"
                ),
                headers=headers,
                json={
                    "user_id": user.id,
                    "onboarding_completed":
                        False,
                },
            )

    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail=(
                "Training profile service "
                "is unavailable"
            ),
        ) from exc

    if response.status_code not in {
        200,
        201,
        204,
    }:
        raise HTTPException(
            status_code=(
                status.HTTP_502_BAD_GATEWAY
            ),
            detail=(
                "Could not create "
                "training profile"
            ),
        )


def _me_response(
    user: AuthenticatedUser,
    access,
    onboarding_completed: bool,
) -> dict:
    return {
        "user_id": user.id,
        "email": user.email,
        "access_status": (
            access.status
            if access
            else "unregistered"
        ),
        "plan": (
            access.plan
            if access
            else None
        ),
        "role": (
            access.role
            if access
            else None
        ),
        "expires_at": (
            access.expires_at
            if access
            else None
        ),
        "onboarding_completed":
            onboarding_completed,
    }


@router.get("/me")
async def get_me(
    user: AuthenticatedUser = Depends(
        authenticate_user
    ),
) -> dict:
    (
        access,
        onboarding_completed,
    ) = await asyncio.gather(
        get_gymos_access(
            user
        ),
        _get_onboarding_completed(
            user
        ),
    )

    return _me_response(
        user,
        access,
        onboarding_completed,
    )


@router.post("/me/bootstrap")
async def bootstrap_me(
    user: AuthenticatedUser = Depends(
        authenticate_user
    ),
) -> dict:
    existing = await get_gymos_access(
        user
    )

    if existing is not None:
        await _ensure_training_profile(
            user
        )

        onboarding_completed = (
            await _get_onboarding_completed(
                user
            )
        )

        return _me_response(
            user,
            existing,
            onboarding_completed,
        )

    supabase_url, _ = (
        _supabase_config()
    )

    headers = _headers(user)

    headers["Prefer"] = (
        "return=representation"
    )

    payload = {
        "user_id": user.id,
        "email": user.email,
        "status": "pending",
        "plan": "trial",
        "role": "user",
    }

    try:
        async with httpx.AsyncClient(
            timeout=10.0
        ) as client:
            response = await client.post(
                (
                    f"{supabase_url}"
                    "/rest/v1/gymos_users"
                ),
                headers=headers,
                json=payload,
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
        201,
    }:
        raise HTTPException(
            status_code=(
                status.HTTP_502_BAD_GATEWAY
            ),
            detail=(
                "Could not create "
                "Aptus access request"
            ),
        )

    rows = response.json()

    row = (
        rows[0]
        if isinstance(
            rows,
            list,
        )
        and rows
        else payload
    )

    await _ensure_training_profile(
        user
    )

    return {
        "user_id": user.id,
        "email": user.email,
        "access_status":
            row.get(
                "status",
                "pending",
            ),
        "plan":
            row.get(
                "plan",
                "trial",
            ),
        "role":
            row.get(
                "role",
                "user",
            ),
        "expires_at":
            row.get(
                "expires_at"
            ),
        "onboarding_completed":
            False,
    }


@router.delete(
    "/me",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_me(
    user: AuthenticatedUser = Depends(
        authenticate_user
    ),
) -> None:
    await delete_account(
        user
    )
