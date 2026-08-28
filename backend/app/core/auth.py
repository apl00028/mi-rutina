from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException, Security, status

from app.core.http_client import (
    get_supabase_http_client,
)
from app.core.supabase_jwt import (
    InvalidSupabaseToken,
    SupabaseJwksUnavailable,
    verify_supabase_access_token,
)
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)


logger = logging.getLogger("uvicorn.error")


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
    Validate the Supabase identity locally.

    The token signature and standard claims
    are verified against Supabase JWKS.

    This avoids calling /auth/v1/user for
    every protected backend request.
    """

    token = _extract_bearer_token(
        credentials
    )

    (
        supabase_url,
        _,
    ) = _supabase_config()

    client = get_supabase_http_client()

    try:
        claims = (
            await verify_supabase_access_token(
                token,
                supabase_url,
                client,
            )
        )

    except InvalidSupabaseToken as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
            ),
            detail=(
                "Invalid or expired access token"
            ),
        ) from exc

    except SupabaseJwksUnavailable as exc:
        logger.warning(
            "supabase_jwks_request_failed "
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
                "Authentication service "
                "is unavailable"
            ),
        ) from exc

    user_id = claims.get("sub")

    if not isinstance(
        user_id,
        str,
    ) or not user_id:
        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
            ),
            detail="Invalid user payload",
        )

    email = claims.get("email")

    if not isinstance(email, str):
        email = None

    return AuthenticatedUser(
        id=user_id,
        email=email,
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
        client = get_supabase_http_client()

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
        logger.warning(
            "supabase_access_request_failed "
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
