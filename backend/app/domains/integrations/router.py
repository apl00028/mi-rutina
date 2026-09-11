from fastapi import (
    APIRouter,
    Depends,
    status,
)

from app.core.auth import (
    AuthenticatedUser,
    require_user,
)
from app.domains.integrations.repository import (
    connect_health_connect,
    disconnect_health_connect,
    get_health_connect_integration,
)


router = APIRouter(
    tags=["Integrations"]
)


@router.get(
    "/integrations/health-connect"
)
async def get_health_connect(
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> dict:
    row = (
        await get_health_connect_integration(
            user
        )
    )

    return {
        "provider": "health_connect",
        "enabled": bool(
            row
            and row.get("enabled") is True
        ),
        "connected_at": (
            row.get("connected_at")
            if row
            else None
        ),
    }


@router.put(
    "/integrations/health-connect"
)
async def enable_health_connect(
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> dict:
    row = await connect_health_connect(
        user
    )

    return {
        "provider": "health_connect",
        "enabled": True,
        "connected_at":
            row.get("connected_at"),
    }


@router.delete(
    "/integrations/health-connect",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def disable_health_connect(
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> None:
    await disconnect_health_connect(
        user
    )
