import httpx
from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.core.auth import AuthenticatedUser, require_user
from app.domains.workouts.models import Workout
from app.domains.exercises.custom_repository import SupabaseConfigError
from app.domains.workouts.service import (
    create_user_workout,
    delete_user_workout,
    delete_user_workout_exercise_record,
    get_user_workout_by_id,
    list_user_workouts,
    replace_user_workout,
)

router = APIRouter(
    tags=["Workouts"]
)


def _raise_workouts_http_error(exc: Exception) -> None:
    if (
        isinstance(exc, httpx.HTTPStatusError)
        and exc.response.status_code == status.HTTP_409_CONFLICT
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Workout already exists",
        ) from exc

    if isinstance(exc, SupabaseConfigError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Workouts service is not configured",
        ) from exc

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Workouts service is unavailable",
    ) from exc


@router.get(
    "/workouts",
    response_model=list[Workout],
    response_model_exclude_none=True,
)
async def list_workouts(
    user: AuthenticatedUser = Depends(require_user),
) -> list[Workout]:
    try:
        return await list_user_workouts(user)
    except (httpx.HTTPError, RuntimeError) as exc:
        _raise_workouts_http_error(exc)


@router.get(
    "/workouts/{workout_id}",
    response_model=Workout,
    response_model_exclude_none=True,
)
async def get_workout(
    workout_id: str,
    user: AuthenticatedUser = Depends(require_user),
) -> Workout:
    try:
        workout = await get_user_workout_by_id(user, workout_id)
    except (httpx.HTTPError, RuntimeError) as exc:
        _raise_workouts_http_error(exc)

    if workout is None:
        raise HTTPException(status_code=404, detail="Workout not found")

    return workout


@router.post(
    "/workouts",
    response_model=Workout,
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_workout(
    request: Workout,
    user: AuthenticatedUser = Depends(require_user),
) -> Workout:
    try:
        return await create_user_workout(user, request)
    except (httpx.HTTPError, RuntimeError) as exc:
        _raise_workouts_http_error(exc)


@router.put(
    "/workouts/{workout_id}",
    response_model=Workout,
    response_model_exclude_none=True,
)
async def replace_workout(
    workout_id: str,
    request: Workout,
    user: AuthenticatedUser = Depends(require_user),
) -> Workout:
    if workout_id != request.workoutId:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="workout_id must match workoutId",
        )

    try:
        workout = await replace_user_workout(user, workout_id, request)
    except (httpx.HTTPError, RuntimeError) as exc:
        _raise_workouts_http_error(exc)

    if workout is None:
        raise HTTPException(status_code=404, detail="Workout not found")

    return workout

@router.delete(
    "/workouts/{workout_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_workout(
    workout_id: str,
    user: AuthenticatedUser = Depends(require_user),
) -> Response:
    try:
        deleted = await delete_user_workout(user, workout_id)
    except (httpx.HTTPError, RuntimeError) as exc:
        _raise_workouts_http_error(exc)

    if not deleted:
        raise HTTPException(status_code=404, detail="Workout not found")

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/workouts/{workout_id}/exercises/{exercise_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_workout_exercise_record(
    workout_id: str,
    exercise_id: str,
    user: AuthenticatedUser = Depends(require_user),
) -> Response:
    try:
        deleted = (
            await delete_user_workout_exercise_record(
                user,
                workout_id,
                exercise_id,
            )
        )
    except (httpx.HTTPError, RuntimeError) as exc:
        _raise_workouts_http_error(exc)

    if not deleted:
        raise HTTPException(
            status_code=404,
            detail="Workout exercise record not found",
        )

    return Response(
        status_code=status.HTTP_204_NO_CONTENT
    )
