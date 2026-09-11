from fastapi import (
    HTTPException,
    status,
)

from app.core.auth import AuthenticatedUser
from app.domains.integrations.repository import (
    get_health_connect_integration,
)


async def health_connect_enabled(
    user: AuthenticatedUser,
) -> bool:
    row = await get_health_connect_integration(
        user
    )

    return bool(
        row
        and row.get("enabled") is True
    )


async def require_health_connect_enabled(
    user: AuthenticatedUser,
) -> None:
    if await health_connect_enabled(user):
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=(
            "Health Connect is not connected "
            "for this Aptus account"
        ),
    )
