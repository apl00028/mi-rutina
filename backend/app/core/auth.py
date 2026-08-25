from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException, Security, status
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)


bearer_scheme = HTTPBearer(
    auto_error=False
)


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    email: str | None = None
    access_token: str | None = None
    plan: str | None = None
    role: str | None = None


@dataclass(frozen=True)
class AptusAccess:
    user_id: str
    email: str | None
    status: str
    plan: str | None
    role: str | None
    expires_at: str | None


def _supabase_config() -> tuple[str, str]:
    supabase_url = os.getenv(
        "SUPABASE_URL",
        "",
    ).rstrip("/")

    publishable_key = os.getenv(
        "SUPABASE_PUBLISHABLE_KEY",
        "",
    )

    if not supabase_url or not publishable_key:
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


def _extract_bearer_token(
    credentials:
        HTTPAuthorizationCredentials | None,
) -> str:
    if (
        credentials is None
        or credentials.scheme.lower() != "bearer"
    ):
        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
            ),
            detail="Missing bearer token",
        )

    token = credentials.credentials.strip()

    if not token:
        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
            ),
            detail="Missing bearer token",
        )

    return token


async def authenticate_user(
    credentials:
        HTTPAuthorizationCredentials | None = Security(
            bearer_scheme
    ),
) -> AuthenticatedUser:
    """
    Validate only the Supabase identity.

    This dependency intentionally does NOT
    require the Aptus account to be active.

    It is suitable for:
    - /me
    - pending-access screens
    - onboarding/access bootstrap flows
    """

    token = _extract_bearer_token(
        credentials
    )

    (
        supabase_url,
        publishable_key,
    ) = _supabase_config()

    headers = {
        "Authorization":
            f"Bearer {token}",
        "apikey":
            publishable_key,
    }

    try:
        async with httpx.AsyncClient(
            timeout=10.0
        ) as client:
            user_response = await client.get(
                f"{supabase_url}/auth/v1/user",
                headers=headers,
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

    if user_response.status_code != 200:
        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
            ),
            detail=(
                "Invalid or expired access token"
            ),
        )

    user_payload = user_response.json()

    user_id = user_payload.get("id")

    if not user_id:
        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
            ),
            detail="Invalid user payload",
        )

    return AuthenticatedUser(
        id=user_id,
        email=user_payload.get(
            "email"
        ),
        access_token=token,
    )


async def get_gymos_access(
    user: AuthenticatedUser,
) -> AptusAccess | None:
    """
    Read the authenticated user's GymOS
    authorization record.

    Returns None when the user has not yet
    been registered in gymos_users.
    """

    (
        supabase_url,
        publishable_key,
    ) = _supabase_config()

    if not user.access_token:
        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
            ),
            detail="Missing access token",
        )

    headers = {
        "Authorization":
            f"Bearer {user.access_token}",
        "apikey":
            publishable_key,
    }

    try:
        async with httpx.AsyncClient(
            timeout=10.0
        ) as client:
            response = await client.get(
                (
                    f"{supabase_url}"
                    "/rest/v1/gymos_users"
                ),
                headers=headers,
                params={
                    "user_id":
                        f"eq.{user.id}",
                    "select": (
                        "user_id,"
                        "email,"
                        "status,"
                        "plan,"
                        "role,"
                        "expires_at"
                    ),
                    "limit":
                        "1",
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
                status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail=(
                "Aptus authorization "
                "service is unavailable"
            ),
        )

    rows = response.json()

    if not rows:
        return None

    access = rows[0]

    return AptusAccess(
        user_id=access[
            "user_id"
        ],
        email=access.get(
            "email"
        ),
        status=access.get(
            "status",
            "pending",
        ),
        plan=access.get(
            "plan"
        ),
        role=access.get(
            "role"
        ),
        expires_at=access.get(
            "expires_at"
        ),
    )


def _validate_active_access(
    access: AptusAccess,
) -> None:
    if access.status != "active":
        raise HTTPException(
            status_code=(
                status.HTTP_403_FORBIDDEN
            ),
            detail=(
                "Aptus account is not active"
            ),
        )

    if not access.expires_at:
        return

    try:
        expires = datetime.fromisoformat(
            access.expires_at.replace(
                "Z",
                "+00:00",
            )
        )

    except (
        TypeError,
        ValueError,
    ) as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail=(
                "Invalid Aptus "
                "authorization configuration"
            ),
        ) from exc

    if expires <= datetime.now(
        timezone.utc
    ):
        raise HTTPException(
            status_code=(
                status.HTTP_403_FORBIDDEN
            ),
            detail=(
                "Aptus access has expired"
            ),
        )


async def require_user(
    credentials:
        HTTPAuthorizationCredentials | None = Security(
            bearer_scheme
    ),
) -> AuthenticatedUser:
    identity = await authenticate_user(
        credentials
    )

    access = await get_gymos_access(
        identity
    )

    if access is None:
        raise HTTPException(
            status_code=(
                status.HTTP_403_FORBIDDEN
            ),
            detail=(
                "Aptus access is not authorized"
            ),
        )

    _validate_active_access(
        access
    )

    return AuthenticatedUser(
        id=identity.id,
        email=identity.email,
        access_token=(
            identity.access_token
        ),
        plan=access.plan,
        role=access.role,
    )
