import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from auth import AuthenticatedUser, require_user
from app.models.routine import Routine
from app.repositories.custom_exercises import SupabaseConfigError
from app.services.routines import get_user_routine_by_id, list_user_routines

router = APIRouter()


def _raise_routines_http_error(exc: Exception) -> None:
    if isinstance(exc, SupabaseConfigError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Routines service is not configured",
        ) from exc

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Routines service is unavailable",
    ) from exc


@router.get(
    "/routines",
    response_model=list[Routine],
    response_model_exclude_none=True,
)
async def list_routines(
    user: AuthenticatedUser = Depends(require_user),
) -> list[Routine]:
    try:
        return await list_user_routines(user)
    except (httpx.HTTPError, RuntimeError) as exc:
        _raise_routines_http_error(exc)


@router.get(
    "/routines/{routine_id}",
    response_model=Routine,
    response_model_exclude_none=True,
)
async def get_routine(
    routine_id: str,
    user: AuthenticatedUser = Depends(require_user),
) -> Routine:
    try:
        routine = await get_user_routine_by_id(user, routine_id)
    except (httpx.HTTPError, RuntimeError) as exc:
        _raise_routines_http_error(exc)

    if routine is None:
        raise HTTPException(status_code=404, detail="Routine not found")

    return routine
