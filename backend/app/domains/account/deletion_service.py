import os

import httpx
from fastapi import HTTPException, status

from app.core.auth import AuthenticatedUser


def _service_role_config() -> tuple[str, str]:
    supabase_url = os.getenv(
        "SUPABASE_URL",
        "",
    ).rstrip("/")

    service_role_key = os.getenv(
        "SUPABASE_SERVICE_ROLE_KEY",
        "",
    )

    if (
        not supabase_url
        or not service_role_key
    ):
        raise HTTPException(
            status_code=(
                status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail=(
                "Account deletion service "
                "is not configured"
            ),
        )

    return (
        supabase_url,
        service_role_key,
    )


def _service_headers() -> dict[str, str]:
    _, service_role_key = (
        _service_role_config()
    )

    return {
        "Authorization":
            f"Bearer {service_role_key}",
        "apikey":
            service_role_key,
        "Content-Type":
            "application/json",
    }


async def _delete_user_data(
    user_id: str,
) -> None:
    supabase_url, _ = (
        _service_role_config()
    )

    try:
        async with httpx.AsyncClient(
            timeout=20.0
        ) as client:
            response = await client.post(
                (
                    f"{supabase_url}"
                    "/rest/v1/rpc/"
                    "delete_aptus_user_data"
                ),
                headers=_service_headers(),
                json={
                    "p_user_id":
                        user_id,
                },
            )

    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail=(
                "Account deletion service "
                "is unavailable"
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
                "Could not delete "
                "Aptus user data"
            ),
        )


async def _delete_auth_user(
    user_id: str,
) -> None:
    supabase_url, _ = (
        _service_role_config()
    )

    try:
        async with httpx.AsyncClient(
            timeout=20.0
        ) as client:
            response = await client.delete(
                (
                    f"{supabase_url}"
                    "/auth/v1/admin/users/"
                    f"{user_id}"
                ),
                headers=_service_headers(),
            )

    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail=(
                "Authentication service "
                "is unavailable"
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
                "Could not delete "
                "Aptus authentication account"
            ),
        )


async def delete_account(
    user: AuthenticatedUser,
) -> None:
    await _delete_user_data(
        user.id
    )

    await _delete_auth_user(
        user.id
    )
