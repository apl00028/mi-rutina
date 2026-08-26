import os

import httpx
from fastapi import HTTPException, status

from app.core.auth import AuthenticatedUser
from app.domains.telemetry.models import (
    TelemetryEventRequest,
)


async def record_event(
    user: AuthenticatedUser,
    event: TelemetryEventRequest,
) -> None:
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
                "Telemetry service "
                "is not configured"
            ),
        )

    if not user.access_token:
        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
            ),
            detail="Missing access token",
        )

    try:
        async with httpx.AsyncClient(
            timeout=5.0
        ) as client:
            response = await client.post(
                (
                    f"{supabase_url}"
                    "/rest/v1/rpc/"
                    "record_app_event"
                ),
                headers={
                    "Authorization":
                        f"Bearer {user.access_token}",
                    "apikey":
                        publishable_key,
                    "Content-Type":
                        "application/json",
                },
                json={
                    "p_event_name":
                        event.event_name,
                    "p_route":
                        event.route,
                    "p_platform":
                        event.platform,
                    "p_app_version":
                        event.app_version,
                    "p_metadata":
                        event.metadata,
                },
            )

    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail=(
                "Telemetry service "
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
                "Could not record telemetry event"
            ),
        )
