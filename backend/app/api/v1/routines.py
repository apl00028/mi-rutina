import httpx
from fastapi import APIRouter, Depends, HTTPException, Response, status

from auth import AuthenticatedUser, require_user
from app.models.routine import Routine
from app.models.routine_generation import (
    RoutineGenerationRequest,
    RoutineGenerationResult,
)
from app.repositories.custom_exercises import SupabaseConfigError
from app.services.routine_generator import (
    generate_routine,
)
from app.services.routines import (
    activate_user_routine,
    create_user_routine,
    delete_user_routine,
    get_user_active_routine,
    get_user_routine_by_id,
    list_user_routines,
    replace_user_routine,
)

router = APIRouter()


def _raise_routines_http_error(
    exc: Exception,
) -> None:
    if (
        isinstance(exc, httpx.HTTPStatusError)
        and exc.response.status_code
        == status.HTTP_409_CONFLICT
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Routine already exists",
        ) from exc

    if isinstance(
        exc,
        SupabaseConfigError,
    ):
        raise HTTPException(
            status_code=(
                status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail=(
                "Routines service "
                "is not configured"
            ),
        ) from exc

    raise HTTPException(
        status_code=(
            status.HTTP_502_BAD_GATEWAY
        ),
        detail=(
            "Routines service "
            "is unavailable"
        ),
    ) from exc


@router.get(
    "/routines",
    response_model=list[Routine],
    response_model_exclude_none=True,
)
async def list_routines(
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> list[Routine]:
    try:
        return await list_user_routines(
            user
        )
    except (
        httpx.HTTPError,
        RuntimeError,
    ) as exc:
        _raise_routines_http_error(
            exc
        )


@router.get(
    "/routines/active",
    response_model=Routine,
    response_model_exclude_none=True,
)
async def get_active_routine(
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> Routine:
    try:
        routine = await get_user_active_routine(
            user
        )
    except (
        httpx.HTTPError,
        RuntimeError,
    ) as exc:
        _raise_routines_http_error(
            exc
        )

    if routine is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "Active routine not found"
            ),
        )

    return routine


@router.post(
    "/routines/generate",
    response_model=RoutineGenerationResult,
    response_model_exclude_none=True,
)
def generate_routine_proposal(
    request: RoutineGenerationRequest,
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> RoutineGenerationResult:
    del user

    return generate_routine(
        request.profile
    )


@router.post(
    "/routines",
    response_model=Routine,
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_routine(
    request: Routine,
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> Routine:
    try:
        return await create_user_routine(
            user,
            request,
        )
    except (
        httpx.HTTPError,
        RuntimeError,
    ) as exc:
        _raise_routines_http_error(
            exc
        )


@router.get(
    "/routines/{routine_id}",
    response_model=Routine,
    response_model_exclude_none=True,
)
async def get_routine(
    routine_id: str,
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> Routine:
    try:
        routine = await get_user_routine_by_id(
            user,
            routine_id,
        )
    except (
        httpx.HTTPError,
        RuntimeError,
    ) as exc:
        _raise_routines_http_error(
            exc
        )

    if routine is None:
        raise HTTPException(
            status_code=404,
            detail="Routine not found",
        )

    return routine


@router.put(
    "/routines/{routine_id}",
    response_model=Routine,
    response_model_exclude_none=True,
)
async def replace_routine(
    routine_id: str,
    request: Routine,
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> Routine:
    if routine_id != request.routineId:
        raise HTTPException(
            status_code=(
                status.HTTP_422_UNPROCESSABLE_ENTITY
            ),
            detail=(
                "routine_id must match "
                "routineId"
            ),
        )

    try:
        routine = await replace_user_routine(
            user,
            routine_id,
            request,
        )
    except (
        httpx.HTTPError,
        RuntimeError,
    ) as exc:
        _raise_routines_http_error(
            exc
        )

    if routine is None:
        raise HTTPException(
            status_code=404,
            detail="Routine not found",
        )

    return routine


@router.delete(
    "/routines/{routine_id}",
    status_code=(
        status.HTTP_204_NO_CONTENT
    ),
)
async def delete_routine(
    routine_id: str,
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> Response:
    try:
        deleted = await delete_user_routine(
            user,
            routine_id,
        )
    except (
        httpx.HTTPError,
        RuntimeError,
    ) as exc:
        _raise_routines_http_error(
            exc
        )

    if not deleted:
        raise HTTPException(
            status_code=404,
            detail="Routine not found",
        )

    return Response(
        status_code=(
            status.HTTP_204_NO_CONTENT
        )
    )


@router.put(
    "/routines/{routine_id}/activate",
    response_model=Routine,
    response_model_exclude_none=True,
)
async def activate_routine(
    routine_id: str,
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> Routine:
    try:
        routine = await activate_user_routine(
            user,
            routine_id,
        )
    except (
        httpx.HTTPError,
        RuntimeError,
    ) as exc:
        _raise_routines_http_error(
            exc
        )

    if routine is None:
        raise HTTPException(
            status_code=404,
            detail="Routine not found",
        )

    return routine