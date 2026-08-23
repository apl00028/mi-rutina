from typing import Any

from app.core.auth import AuthenticatedUser

from app.domains.health_tracking.models import (
    DailyCheckInInput,
)
from app.domains.health_tracking.service import (
    save_user_daily_checkin,
)
from app.domains.nutrition.models import (
    NutritionMealCompletion,
    NutritionPlan,
    ShoppingListItem,
)
from app.domains.nutrition.repository import (
    create_nutrition_plan,
    delete_nutrition_plan,
    get_nutrition_plan_by_id,
    get_nutrition_plan_by_week,
    list_nutrition_plans,
    list_nutrition_meal_completions,
    replace_nutrition_plan,
    upsert_nutrition_meal_completion,
    delete_nutrition_meal_completion,
)


CLIENT_CONTROLLED_FIELDS = {
    "user_id",
    "userId",
    "owner_id",
    "ownerId",
    "created_by",
    "createdBy",
    "is_admin",
    "isAdmin",
}


def _strip_client_controlled_fields(
    payload: dict[str, Any],
) -> dict[str, Any]:
    return {
        key: value
        for key, value in payload.items()
        if key not in CLIENT_CONTROLLED_FIELDS
    }


def nutrition_row_to_model(
    row: dict[str, Any],
) -> NutritionPlan:
    data = row.get("data")

    if not isinstance(data, dict):
        raise RuntimeError(
            "Unexpected Supabase response."
        )

    payload = _strip_client_controlled_fields(
        dict(data)
    )

    payload["planId"] = row.get("id")
    payload["weekStart"] = row.get("week_start")
    payload["status"] = row.get("status")
    payload["createdAt"] = row.get("created_at")
    payload["updatedAt"] = row.get("updated_at")

    return NutritionPlan.model_validate(payload)


def nutrition_to_storage_payload(
    plan: NutritionPlan,
) -> dict[str, Any]:
    payload = plan.model_dump(
        mode="json",
        exclude_none=True,
        exclude={
            "createdAt",
            "updatedAt",
        },
    )

    return _strip_client_controlled_fields(payload)


async def list_user_nutrition_plans(
    user: AuthenticatedUser,
) -> list[NutritionPlan]:
    rows = await list_nutrition_plans(user)

    return [
        nutrition_row_to_model(row)
        for row in rows
    ]


async def get_user_nutrition_plan_by_id(
    user: AuthenticatedUser,
    plan_id: str,
) -> NutritionPlan | None:
    row = await get_nutrition_plan_by_id(
        user,
        plan_id,
    )

    if row is None:
        return None

    return nutrition_row_to_model(row)


async def get_user_nutrition_plan_by_week(
    user: AuthenticatedUser,
    week_start,
) -> NutritionPlan | None:
    row = await get_nutrition_plan_by_week(
        user,
        week_start,
    )

    if row is None:
        return None

    return nutrition_row_to_model(row)


async def create_user_nutrition_plan(
    user: AuthenticatedUser,
    plan: NutritionPlan,
) -> NutritionPlan:
    row = await create_nutrition_plan(
        user,
        nutrition_to_storage_payload(plan),
    )

    return nutrition_row_to_model(row)


async def replace_user_nutrition_plan(
    user: AuthenticatedUser,
    plan_id: str,
    plan: NutritionPlan,
) -> NutritionPlan | None:
    row = await replace_nutrition_plan(
        user,
        plan_id,
        nutrition_to_storage_payload(plan),
    )

    if row is None:
        return None

    return nutrition_row_to_model(row)


async def delete_user_nutrition_plan(
    user: AuthenticatedUser,
    plan_id: str,
) -> bool:
    return await delete_nutrition_plan(
        user,
        plan_id,
    )



def nutrition_completion_row_to_model(
    row: dict[str, Any],
) -> NutritionMealCompletion:
    return NutritionMealCompletion.model_validate({
        "id":
            row["id"],
        "planId":
            row["plan_id"],
        "mealDate":
            row["meal_date"],
        "mealId":
            row["meal_id"],
        "createdAt":
            row.get("created_at"),
        "updatedAt":
            row.get("updated_at"),
    })


def _meal_date_for_id(
    plan: NutritionPlan,
    meal_id: str,
):
    for day in plan.days:
        for meal in day.meals:
            if meal.mealId == meal_id:
                return day.date

    return None


async def list_user_nutrition_meal_completions(
    user: AuthenticatedUser,
    plan_id: str,
) -> list[NutritionMealCompletion] | None:

    plan = await get_user_nutrition_plan_by_id(
        user,
        plan_id,
    )

    if plan is None:
        return None

    rows = (
        await list_nutrition_meal_completions(
            user,
            plan_id,
        )
    )

    return [
        nutrition_completion_row_to_model(row)
        for row in rows
    ]


async def _sync_daily_meal_adherence(
    user: AuthenticatedUser,
    plan: NutritionPlan,
    meal_date,
) -> None:

    day = next(
        (
            item
            for item in plan.days
            if item.date == meal_date
        ),
        None,
    )

    if day is None or not day.meals:
        return

    rows = (
        await list_nutrition_meal_completions(
            user,
            str(plan.planId),
        )
    )

    planned_ids = {
        meal.mealId
        for meal in day.meals
    }

    completed_ids = {
        row.get("meal_id")
        for row in rows
        if (
            row.get("meal_date")
            == meal_date.isoformat()
            and row.get("meal_id")
            in planned_ids
        )
    }

    adherence = round(
        len(completed_ids)
        / len(planned_ids)
        * 100,
        2,
    )

    await save_user_daily_checkin(
        user,
        meal_date,
        DailyCheckInInput(
            dietAdherencePercent=adherence
        ),
    )


async def mark_user_nutrition_meal(
    user: AuthenticatedUser,
    plan_id: str,
    meal_id: str,
) -> NutritionMealCompletion | None:

    plan = await get_user_nutrition_plan_by_id(
        user,
        plan_id,
    )

    if plan is None:
        return None

    meal_date = _meal_date_for_id(
        plan,
        meal_id,
    )

    if meal_date is None:
        return None

    row = (
        await upsert_nutrition_meal_completion(
            user,
            plan_id,
            meal_date,
            meal_id,
        )
    )

    await _sync_daily_meal_adherence(
        user,
        plan,
        meal_date,
    )

    return nutrition_completion_row_to_model(
        row
    )


async def unmark_user_nutrition_meal(
    user: AuthenticatedUser,
    plan_id: str,
    meal_id: str,
) -> bool:

    plan = await get_user_nutrition_plan_by_id(
        user,
        plan_id,
    )

    if plan is None:
        return False

    meal_date = _meal_date_for_id(
        plan,
        meal_id,
    )

    if meal_date is None:
        return False

    deleted = (
        await delete_nutrition_meal_completion(
            user,
            plan_id,
            meal_id,
        )
    )

    if not deleted:
        return False

    await _sync_daily_meal_adherence(
        user,
        plan,
        meal_date,
    )

    return True


def build_shopping_list(
    plan: NutritionPlan,
) -> list[ShoppingListItem]:

    totals: dict[
        tuple[str, str, str],
        float,
    ] = {}

    display: dict[
        tuple[str, str, str],
        dict[str, str | None],
    ] = {}

    sources: dict[
        tuple[str, str, str],
        list[dict[str, str]],
    ] = {}

    for day in plan.days:
        for meal in day.meals:
            for ingredient in meal.ingredients:

                brand = (
                    ingredient.productBrand.strip()
                    if ingredient.productBrand
                    else ""
                )

                key = (
                    ingredient.name.strip().casefold(),
                    ingredient.unit.strip().casefold(),
                    brand.casefold(),
                )

                totals[key] = (
                    totals.get(key, 0)
                    + ingredient.quantity
                )

                display.setdefault(
                    key,
                    {
                        "name":
                            ingredient.name.strip(),
                        "unit":
                            ingredient.unit.strip(),
                        "productBrand":
                            brand or None,
                    },
                )

                source = {
                    "date": day.date.isoformat(),
                    "mealType": meal.type,
                    "mealName": meal.name,
                }

                current_sources = sources.setdefault(
                    key,
                    [],
                )

                if source not in current_sources:
                    current_sources.append(source)

    return [
        ShoppingListItem(
            name=str(display[key]["name"]),
            unit=str(display[key]["unit"]),
            quantity=quantity,
            productBrand=display[key]["productBrand"],
            sources=sources.get(key, []),
        )
        for key, quantity in sorted(
            totals.items(),
            key=lambda item: item[0],
        )
    ]
