import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from starlette.responses import Response

from app.core.auth import AuthenticatedUser, require_user
from app.domains.exercises.schemas import CustomExerciseCreate, CustomExerciseUpdate
from app.domains.exercises.catalog_service import load_exercise_catalog
from app.domains.exercises.models import Exercise, ExerciseListItem
from app.domains.exercises.resolution_models import (
    ExerciseResolveRequest,
    ExerciseResolveResponse,
)
from app.domains.exercises.custom_repository import SupabaseConfigError
from app.domains.exercises.custom_service import (
    get_custom_exercise_model_by_id,
    list_custom_exercise_models,
    register_custom_exercise,
    remove_custom_exercise,
    update_custom_exercise_model,
)
from app.domains.exercises.favorites_service import (
    list_user_favorite_exercise_ids,
    mark_exercise_favorite,
    unmark_exercise_favorite,
)
from app.domains.exercises.resolution_service import resolve_exercise
from app.domains.exercises.service import get_exercise_by_id, load_exercises

router = APIRouter(
    tags=["Exercises"]
)


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


def _with_favorite(exercise: Exercise, favorite_ids: set[str]) -> Exercise:
    return exercise.model_copy(
        update={"favorite": exercise.id in favorite_ids},
    )


def _with_favorites(
    exercises: list[Exercise],
    favorite_ids: set[str],
) -> list[Exercise]:
    return [_with_favorite(exercise, favorite_ids) for exercise in exercises]


def _with_catalog_metadata(
    exercises: list[Exercise],
) -> list[ExerciseListItem]:
    unilateral_by_id = {
        exercise.id: exercise.metadata.unilateral
        for exercise in load_exercise_catalog()
    }

    return [
        ExerciseListItem(
            **exercise.model_dump(),
            unilateral=unilateral_by_id.get(exercise.id),
        )
        for exercise in exercises
    ]


async def _get_custom_exercise_or_none(
    user: AuthenticatedUser,
    exercise_id: str,
) -> Exercise | None:
    try:
        return await get_custom_exercise_model_by_id(user, exercise_id)
    except (httpx.HTTPError, RuntimeError) as exc:
        _raise_custom_exercises_http_error(exc)


async def _resolve_exercise_for_user(
    user: AuthenticatedUser,
    exercise_id: str,
    favorite_ids: set[str],
) -> Exercise | None:
    exercise = get_exercise_by_id(exercise_id)

    if exercise is not None:
        return _with_favorite(exercise, favorite_ids)

    if exercise_id.startswith("custom-"):
        custom_exercise = await _get_custom_exercise_or_none(user, exercise_id)

        if custom_exercise is not None:
            return _with_favorite(custom_exercise, favorite_ids)

    return None


@router.get(
    "/exercises",
    response_model=list[ExerciseListItem],
    response_model_exclude_none=True,
)
async def list_exercises(
    user: AuthenticatedUser = Depends(require_user),
) -> list[ExerciseListItem]:
    built_in_exercises = load_exercises()

    custom_exercises: list[Exercise] = []
    favorite_ids: set[str] = set()

    try:
        custom_exercises = await list_custom_exercise_models(user)
    except (httpx.HTTPError, RuntimeError):
        pass

    try:
        favorite_ids = await list_user_favorite_exercise_ids(user)
    except (httpx.HTTPError, RuntimeError):
        pass

    return _with_catalog_metadata(
        _with_favorites(
            built_in_exercises + custom_exercises,
            favorite_ids,
        )
    )


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
    exercise = await _resolve_exercise_for_user(user, exercise_id, set())

    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found")

    try:
        favorite_ids = await list_user_favorite_exercise_ids(user)
    except (httpx.HTTPError, RuntimeError) as exc:
        _raise_custom_exercises_http_error(exc)

    return _with_favorite(exercise, favorite_ids)


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


@router.put(
    "/exercises/{exercise_id}/favorite",
    response_model=Exercise,
    response_model_exclude_none=True,
)
async def favorite_exercise(
    exercise_id: str,
    user: AuthenticatedUser = Depends(require_user),
) -> Exercise:
    exercise = await _resolve_exercise_for_user(user, exercise_id, set())

    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found")

    try:
        await mark_exercise_favorite(user, exercise.id)
    except (httpx.HTTPError, RuntimeError) as exc:
        _raise_custom_exercises_http_error(exc)

    return exercise.model_copy(update={"favorite": True})


@router.delete(
    "/exercises/{exercise_id}/favorite",
    response_model=Exercise,
    response_model_exclude_none=True,
)
async def unfavorite_exercise(
    exercise_id: str,
    user: AuthenticatedUser = Depends(require_user),
) -> Exercise:
    exercise = await _resolve_exercise_for_user(user, exercise_id, {exercise_id})

    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found")

    try:
        await unmark_exercise_favorite(user, exercise.id)
    except (httpx.HTTPError, RuntimeError) as exc:
        _raise_custom_exercises_http_error(exc)

    return exercise.model_copy(update={"favorite": False})
