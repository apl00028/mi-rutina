import httpx
from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.core.auth import AuthenticatedUser, require_user
from app.domains.exercises.custom_repository import SupabaseConfigError
from app.domains.nutrition.models import (
    NutritionMealCompletion,
    NutritionPlan,
    ShoppingListItem,
)
from app.domains.nutrition.service import (
    build_shopping_list,
    create_user_nutrition_plan,
    delete_user_nutrition_plan,
    get_user_nutrition_plan_by_id,
    list_user_nutrition_plans,
    list_user_nutrition_meal_completions,
    mark_user_nutrition_meal,
    replace_user_nutrition_plan,
    unmark_user_nutrition_meal,
)


router = APIRouter(
    prefix="/nutrition",
    tags=["Nutrition"],
)


def _raise_nutrition_http_error(
    exc: Exception,
) -> None:
    if (
        isinstance(exc, httpx.HTTPStatusError)
        and exc.response.status_code
        == status.HTTP_409_CONFLICT
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nutrition plan already exists",
        ) from exc

    if isinstance(exc, SupabaseConfigError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Nutrition service is not configured",
        ) from exc

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Nutrition service is unavailable",
    ) from exc


@router.get(
    "/plans",
    response_model=list[NutritionPlan],
    response_model_exclude_none=True,
)
async def list_plans(
    user: AuthenticatedUser = Depends(require_user),
) -> list[NutritionPlan]:
    try:
        return await list_user_nutrition_plans(user)
    except (httpx.HTTPError, RuntimeError) as exc:
        _raise_nutrition_http_error(exc)


@router.post(
    "/plans",
    response_model=NutritionPlan,
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_plan(
    request: NutritionPlan,
    user: AuthenticatedUser = Depends(require_user),
) -> NutritionPlan:
    try:
        return await create_user_nutrition_plan(
            user,
            request,
        )
    except (httpx.HTTPError, RuntimeError) as exc:
        _raise_nutrition_http_error(exc)


@router.get(
    "/plans/{plan_id}",
    response_model=NutritionPlan,
    response_model_exclude_none=True,
)
async def get_plan(
    plan_id: str,
    user: AuthenticatedUser = Depends(require_user),
) -> NutritionPlan:
    try:
        plan = await get_user_nutrition_plan_by_id(
            user,
            plan_id,
        )
    except (httpx.HTTPError, RuntimeError) as exc:
        _raise_nutrition_http_error(exc)

    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nutrition plan not found",
        )

    return plan


@router.put(
    "/plans/{plan_id}",
    response_model=NutritionPlan,
    response_model_exclude_none=True,
)
async def replace_plan(
    plan_id: str,
    request: NutritionPlan,
    user: AuthenticatedUser = Depends(require_user),
) -> NutritionPlan:
    if plan_id != str(request.planId):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="plan_id must match planId",
        )

    try:
        plan = await replace_user_nutrition_plan(
            user,
            plan_id,
            request,
        )
    except (httpx.HTTPError, RuntimeError) as exc:
        _raise_nutrition_http_error(exc)

    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nutrition plan not found",
        )

    return plan


@router.delete(
    "/plans/{plan_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_plan(
    plan_id: str,
    user: AuthenticatedUser = Depends(require_user),
) -> Response:
    try:
        deleted = await delete_user_nutrition_plan(
            user,
            plan_id,
        )
    except (httpx.HTTPError, RuntimeError) as exc:
        _raise_nutrition_http_error(exc)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nutrition plan not found",
        )

    return Response(
        status_code=status.HTTP_204_NO_CONTENT
    )


@router.get(
    "/plans/{plan_id}/meal-completions",
    response_model=list[NutritionMealCompletion],
    response_model_exclude_none=True,
)
async def meal_completions(
    plan_id: str,
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> list[NutritionMealCompletion]:

    try:
        items = (
            await list_user_nutrition_meal_completions(
                user,
                plan_id,
            )
        )
    except (
        httpx.HTTPError,
        RuntimeError,
    ) as exc:
        _raise_nutrition_http_error(exc)

    if items is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nutrition plan not found",
        )

    return items


@router.put(
    "/plans/{plan_id}/meal-completions/{meal_id}",
    response_model=NutritionMealCompletion,
    response_model_exclude_none=True,
)
async def mark_meal_completion(
    plan_id: str,
    meal_id: str,
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> NutritionMealCompletion:

    try:
        item = await mark_user_nutrition_meal(
            user,
            plan_id,
            meal_id,
        )
    except (
        httpx.HTTPError,
        RuntimeError,
    ) as exc:
        _raise_nutrition_http_error(exc)

    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nutrition meal not found",
        )

    return item


@router.delete(
    "/plans/{plan_id}/meal-completions/{meal_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def unmark_meal_completion(
    plan_id: str,
    meal_id: str,
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> Response:

    try:
        deleted = (
            await unmark_user_nutrition_meal(
                user,
                plan_id,
                meal_id,
            )
        )
    except (
        httpx.HTTPError,
        RuntimeError,
    ) as exc:
        _raise_nutrition_http_error(exc)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nutrition meal completion not found",
        )

    return Response(
        status_code=status.HTTP_204_NO_CONTENT
    )


@router.get(
    "/plans/{plan_id}/shopping-list",
    response_model=list[ShoppingListItem],
)
async def shopping_list(
    plan_id: str,
    user: AuthenticatedUser = Depends(require_user),
) -> list[ShoppingListItem]:
    try:
        plan = await get_user_nutrition_plan_by_id(
            user,
            plan_id,
        )
    except (httpx.HTTPError, RuntimeError) as exc:
        _raise_nutrition_http_error(exc)

    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nutrition plan not found",
        )

    return build_shopping_list(plan)
