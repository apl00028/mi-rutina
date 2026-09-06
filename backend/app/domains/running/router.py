import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import AuthenticatedUser, require_user
from app.domains.running.models import RunningSession, RunningSyncRequest, RunningSyncResult
from app.domains.running.service import (
    list_user_running_sessions, running_service_error, sync_user_running_health_connect,
)


router = APIRouter(tags=["Running"])


@router.post("/running/sync-health-connect", response_model=RunningSyncResult,
             response_model_exclude_unset=True)
async def sync_running_health_connect(
    request: RunningSyncRequest, user: AuthenticatedUser = Depends(require_user),
) -> RunningSyncResult:
    return await sync_user_running_health_connect(user, request)


@router.get("/running/sessions", response_model=list[RunningSession],
            response_model_exclude_unset=True)
async def get_running_sessions(
    user: AuthenticatedUser = Depends(require_user),
) -> list[RunningSession]:
    try:
        return await list_user_running_sessions(user)
    except (httpx.HTTPError, RuntimeError, ValueError) as exc:
        error = running_service_error(exc)
        raise HTTPException(status_code=error.status_code, detail=error.detail) from exc
