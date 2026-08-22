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

