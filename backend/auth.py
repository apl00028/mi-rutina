from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx
from fastapi import Header, HTTPException, status


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    email: str | None = None
    access_token: str | None = None
    plan: str | None = None
    role: str | None = None


async def require_user(
    authorization: str | None = Header(default=None),
) -> AuthenticatedUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )

    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    publishable_key = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")

    if not supabase_url or not publishable_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is not configured",
        )

    token = authorization.split(" ", 1)[1].strip()

    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": publishable_key,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        # 1. Comprobar que el token pertenece a un usuario real de Supabase.
        user_response = await client.get(
            f"{supabase_url}/auth/v1/user",
            headers=headers,
        )

        if user_response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired access token",
            )

        user_payload = user_response.json()
        user_id = user_payload.get("id")

        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid user payload",
            )

        # 2. Comprobar autorización de GymOS.
        access_response = await client.get(
            f"{supabase_url}/rest/v1/gymos_users",
            headers=headers,
            params={
                "user_id": f"eq.{user_id}",
                "select": "user_id,email,status,plan,role,expires_at",
                "limit": "1",
            },
        )

    if access_response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GymOS authorization service is unavailable",
        )

    rows = access_response.json()

    if not rows:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="GymOS access is not authorized",
        )

    access = rows[0]

    # 3. Debe estar explícitamente activo.
    if access.get("status") != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="GymOS account is not active",
        )

    # 4. Si tiene fecha de expiración, comprobarla.
    expires_at = access.get("expires_at")

    if expires_at:
        try:
            expires = datetime.fromisoformat(
                expires_at.replace("Z", "+00:00")
            )

            if expires <= datetime.now(timezone.utc):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="GymOS access has expired",
                )
        except HTTPException:
            raise
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Invalid GymOS authorization configuration",
            )

    return AuthenticatedUser(
        id=user_id,
        email=user_payload.get("email"),
        access_token=token,
        plan=access.get("plan"),
        role=access.get("role"),
    )