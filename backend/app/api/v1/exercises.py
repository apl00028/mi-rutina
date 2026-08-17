import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from starlette.responses import Response

from auth import AuthenticatedUser, require_user
from app.models.custom_exercise import CustomExerciseCreate, CustomExerciseUpdate
from app.models.exercise import Exercise
from app.models.exercise_resolution import (
    ExerciseResolveRequest,
    ExerciseResolveResponse,
)
from app.repositories.custom_exercises import SupabaseConfigError
from app.services.custom_exercises import (
    get_custom_exercise_model_by_id,
    list_custom_exercise_models,
    register_custom_exercise,
    remove_custom_exercise,
    update_custom_exercise_model,
)
from app.services.exercise_resolution import resolve_exercise
from app.services.exercises import get_exercise_by_id, load_exercises

router = APIRouter()


def _raise_custom_exercises_http_error(exc: Exception) -> None:
    if isinstance(exc, SupabaseConfigError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Custom exercises service is not configured",
        ) from exc

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Custom exercises service is unavailable",
    ) from exc


@router.get(
    "/exercises",
    response_model=list[Exercise],
    response_model_exclude_none=True,
)
async def list_exercises(
    user: AuthenticatedUser = Depends(require_user),
) -> list[Exercise]:
    built_in_exercises = load_exercises()

    try:
        custom_exercises = await list_custom_exercise_models(user)
    except (httpx.HTTPError, RuntimeError) as exc:
        _raise_custom_exercises_http_error(exc)

    return built_in_exercises + custom_exercises


@router.post(
    "/exercises",
    response_model=Exercise,
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_custom_exercise(
    request: CustomExerciseCreate,
    user: AuthenticatedUser = Depends(require_user),
) -> Exercise:
    return await register_custom_exercise(user, request)


@router.post(
    "/exercises/resolve",
    response_model=ExerciseResolveResponse,
    response_model_exclude_none=True,
)
def resolve_exercise_reference(
    request: ExerciseResolveRequest,
) -> ExerciseResolveResponse:
    return resolve_exercise(
        exercise_id=request.exerciseId,
        exercise_name=request.exerciseName,
    )


@router.get(
    "/exercises/{exercise_id}",
    response_model=Exercise,
    response_model_exclude_none=True,
)
async def get_exercise(
    exercise_id: str,
    user: AuthenticatedUser = Depends(require_user),
) -> Exercise:
    exercise = get_exercise_by_id(exercise_id)

    if exercise is not None:
        return exercise

    if exercise_id.startswith("custom-"):
        try:
            custom_exercise = await get_custom_exercise_model_by_id(user, exercise_id)
        except (httpx.HTTPError, RuntimeError) as exc:
            _raise_custom_exercises_http_error(exc)

        if custom_exercise is not None:
            return custom_exercise

    raise HTTPException(status_code=404, detail="Exercise not found")


@router.patch(
    "/exercises/{exercise_id}",
    response_model=Exercise,
    response_model_exclude_none=True,
)
async def update_exercise(
    exercise_id: str,
    request: CustomExerciseUpdate,
    user: AuthenticatedUser = Depends(require_user),
) -> Exercise:
    if get_exercise_by_id(exercise_id) is not None:
        raise HTTPException(status_code=404, detail="Exercise not found")

    if exercise_id.startswith("custom-"):
        try:
            custom_exercise = await update_custom_exercise_model(
                user,
                exercise_id,
                request,
            )
        except (httpx.HTTPError, RuntimeError) as exc:
            _raise_custom_exercises_http_error(exc)

        if custom_exercise is not None:
            return custom_exercise

    raise HTTPException(status_code=404, detail="Exercise not found")


@router.delete(
    "/exercises/{exercise_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_exercise(
    exercise_id: str,
    user: AuthenticatedUser = Depends(require_user),
) -> Response:
    if get_exercise_by_id(exercise_id) is not None:
        raise HTTPException(status_code=404, detail="Exercise not found")

    if exercise_id.startswith("custom-"):
        try:
            deleted = await remove_custom_exercise(user, exercise_id)
        except (httpx.HTTPError, RuntimeError) as exc:
            _raise_custom_exercises_http_error(exc)

        if deleted:
            return Response(status_code=status.HTTP_204_NO_CONTENT)

    raise HTTPException(status_code=404, detail="Exercise not found")
