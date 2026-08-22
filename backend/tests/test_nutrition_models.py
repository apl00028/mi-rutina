from datetime import date

import pytest
from pydantic import ValidationError

from app.domains.nutrition.models import NutritionPlan


def valid_plan() -> dict:
    return {
        "planId": (
            "7d80a518-b080-4c8f-9781-92f39fb5809a"
        ),
        "schemaVersion": "1.0",
        "weekStart": "2026-08-24",
        "status": "active",
        "goal": "lose_fat",
        "targets": {
            "calorieTarget": 2200,
            "proteinTarget": 160,
            "carbTarget": 230,
            "fatTarget": 70,
        },
        "days": [
            {
                "date": "2026-08-24",
                "meals": [
                    {
                        "mealId": "monday-lunch",
                        "type": "lunch",
                        "name": (
                            "Pollo con arroz y verduras"
                        ),
                        "ingredients": [
                            {
                                "ingredientId": "chicken",
                                "name": "Pechuga de pollo",
                                "quantity": 200,
                                "unit": "g",
                                "measurementBasis": "raw",
                            },
                            {
                                "ingredientId": "rice",
                                "name": "Arroz basmati",
                                "quantity": 85,
                                "unit": "g",
                                "measurementBasis": "raw",
                            },
                        ],
                    }
                ],
            }
        ],
    }


def test_accepts_valid_individual_plan():
    plan = NutritionPlan.model_validate(
        valid_plan()
    )

    assert plan.weekStart == date(2026, 8, 24)
    assert plan.goal == "lose_fat"
    assert plan.targets is not None
    assert plan.targets.proteinTarget == 160


def test_plan_can_exist_without_targets():
    payload = valid_plan()
    payload["targets"] = None

    plan = NutritionPlan.model_validate(payload)

    assert plan.targets is None


def test_invalid_goal_is_rejected():
    payload = valid_plan()
    payload["goal"] = "get_shredded"

    with pytest.raises(ValidationError):
        NutritionPlan.model_validate(payload)


def test_day_must_belong_to_plan_week():
    payload = valid_plan()
    payload["days"][0]["date"] = "2026-09-01"

    with pytest.raises(
        ValidationError,
        match="must belong to the plan week",
    ):
        NutritionPlan.model_validate(payload)


def test_duplicate_day_is_rejected():
    payload = valid_plan()
    payload["days"].append(
        payload["days"][0].copy()
    )

    with pytest.raises(
        ValidationError,
        match="day dates must be unique",
    ):
        NutritionPlan.model_validate(payload)


def test_ingredient_quantity_must_be_positive():
    payload = valid_plan()

    payload["days"][0]["meals"][0][
        "ingredients"
    ][0]["quantity"] = 0

    with pytest.raises(ValidationError):
        NutritionPlan.model_validate(payload)


def test_product_measurement_basis_is_supported():
    payload = valid_plan()

    ingredient = payload["days"][0]["meals"][0][
        "ingredients"
    ][0]

    ingredient["measurementBasis"] = "product"

    plan = NutritionPlan.model_validate(payload)

    assert (
        plan.days[0]
        .meals[0]
        .ingredients[0]
        .measurementBasis
        == "product"
    )

def test_ingredient_can_store_verified_product_nutrition():
    payload = valid_plan()

    ingredient = payload["days"][0]["meals"][0]["ingredients"][0]

    ingredient["productBrand"] = "Mercadona / Hacendado"
    ingredient["nutritionPer100g"] = {
        "calories": 120,
        "protein": 23,
        "carbs": 0,
        "fat": 2,
    }
    ingredient["notes"] = "Valores procedentes de etiqueta"

    plan = NutritionPlan.model_validate(payload)
    parsed = plan.days[0].meals[0].ingredients[0]

    assert parsed.productBrand == "Mercadona / Hacendado"
    assert parsed.nutritionPer100g is not None
    assert parsed.nutritionPer100g.protein == 23



def test_meal_supports_recipe_details():
    payload = valid_plan()

    meal = payload[
        "days"
    ][0]["meals"][0]

    meal.update({
        "recipeId": "pollo-arroz",
        "servings": 2,
        "prepMinutes": 10,
        "cookMinutes": 20,
        "steps": [
            "Cocer el arroz.",
            "Cocinar el pollo.",
            "Servir con las verduras.",
        ],
        "notes": (
            "Arroz pesado en crudo."
        ),
    })

    plan = NutritionPlan.model_validate(
        payload
    )

    parsed = (
        plan.days[0]
        .meals[0]
    )

    assert parsed.recipeId == "pollo-arroz"
    assert parsed.servings == 2
    assert parsed.prepMinutes == 10
    assert parsed.cookMinutes == 20
    assert len(parsed.steps) == 3


def test_old_meals_get_recipe_defaults():
    plan = NutritionPlan.model_validate(
        valid_plan()
    )

    meal = plan.days[0].meals[0]

    assert meal.recipeId is None
    assert meal.servings == 1
    assert meal.prepMinutes is None
    assert meal.cookMinutes is None
    assert meal.steps == []


def test_shopping_list_item_supports_sources():
    from app.domains.nutrition.models import (
        ShoppingListItem,
    )

    item = ShoppingListItem.model_validate({
        "name": "Pechuga de pollo",
        "unit": "g",
        "quantity": 600,
        "productBrand": "Mercadona",
        "sources": [
            {
                "date": "2026-08-24",
                "mealType": "lunch",
                "mealName": "Pollo con arroz",
            }
        ],
    })

    assert item.productBrand == "Mercadona"
    assert len(item.sources) == 1
    assert (
        item.sources[0].mealName
        == "Pollo con arroz"
    )
