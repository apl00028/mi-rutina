from fastapi import (
    APIRouter,
    Depends,
    status,
)

from app.core.auth import (
    AuthenticatedUser,
    require_user,
)
from app.domains.telemetry.models import (
    TelemetryEventRequest,
)
from app.domains.telemetry.service import (
    record_event,
)


router = APIRouter(
    tags=["Telemetry"]
)


@router.post(
    "/telemetry/events",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def telemetry_event(
    event: TelemetryEventRequest,
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> None:
    await record_event(
        user,
        event,
    )
