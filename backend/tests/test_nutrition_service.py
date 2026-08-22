from app.domains.nutrition.models import NutritionPlan
from app.domains.nutrition.service import (
    build_shopping_list,
    nutrition_row_to_model,
    nutrition_to_storage_payload,
)


def plan_payload() -> dict:
    return {
        "planId": "7d80a518-b080-4c8f-9781-92f39fb5809a",
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
                        "name": "Pollo con arroz",
                        "ingredients": [
                            {
                                "ingredientId": "chicken-1",
                                "name": "Pechuga de pollo",
                                "quantity": 200,
                                "unit": "g",
                                "measurementBasis": "raw",
                            },
                            {
                                "ingredientId": "rice-1",
                                "name": "Arroz basmati",
                                "quantity": 85,
                                "unit": "g",
                                "measurementBasis": "raw",
                            },
                        ],
                    }
                ],
            },
            {
                "date": "2026-08-26",
                "meals": [
                    {
                        "mealId": "wednesday-lunch",
                        "type": "lunch",
                        "name": "Pollo con patata",
                        "ingredients": [
                            {
                                "ingredientId": "chicken-2",
                                "name": "Pechuga de pollo",
                                "quantity": 200,
                                "unit": "g",
                                "measurementBasis": "raw",
                            },
                            {
                                "ingredientId": "potato-1",
                                "name": "Patata",
                                "quantity": 500,
                                "unit": "g",
                                "measurementBasis": "raw",
                            },
                        ],
                    }
                ],
            },
        ],
    }


def test_build_shopping_list_aggregates_ingredients():
    plan = NutritionPlan.model_validate(plan_payload())

    shopping_list = build_shopping_list(plan)

    by_name = {
        item.name: item
        for item in shopping_list
    }

    assert by_name["Pechuga de pollo"].quantity == 400
    assert by_name["Arroz basmati"].quantity == 85
    assert by_name["Patata"].quantity == 500


def test_storage_payload_excludes_server_timestamps():
    payload = plan_payload()
    payload["createdAt"] = "2026-08-22T10:00:00Z"
    payload["updatedAt"] = "2026-08-22T11:00:00Z"

    plan = NutritionPlan.model_validate(payload)

    stored = nutrition_to_storage_payload(plan)

    assert "createdAt" not in stored
    assert "updatedAt" not in stored
    assert stored["goal"] == "lose_fat"
    assert stored["weekStart"] == "2026-08-24"


def test_supabase_row_is_converted_to_plan():
    payload = plan_payload()

    row = {
        "id": payload["planId"],
        "user_id": "user-123",
        "week_start": "2026-08-24",
        "status": "active",
        "data": payload,
        "created_at": "2026-08-22T10:00:00Z",
        "updated_at": "2026-08-22T11:00:00Z",
    }

    plan = nutrition_row_to_model(row)

    assert str(plan.planId) == payload["planId"]
    assert plan.goal == "lose_fat"
    assert plan.createdAt == "2026-08-22T10:00:00Z"
    assert plan.updatedAt == "2026-08-22T11:00:00Z"


def test_server_columns_override_stale_json_values():
    payload = plan_payload()

    payload["weekStart"] = "2026-01-01"
    payload["status"] = "draft"

    row = {
        "id": payload["planId"],
        "user_id": "user-123",
        "week_start": "2026-08-24",
        "status": "active",
        "data": payload,
        "created_at": None,
        "updated_at": None,
    }

    plan = nutrition_row_to_model(row)

    assert plan.weekStart.isoformat() == "2026-08-24"
    assert plan.status == "active"


def test_shopping_list_keeps_brand_and_meal_sources():
    payload = plan_payload()

    payload["days"][0]["meals"][0][
        "ingredients"
    ][0]["productBrand"] = (
        "Mercadona / Hacendado"
    )

    payload["days"][1]["meals"][0][
        "ingredients"
    ][0]["productBrand"] = (
        "Mercadona / Hacendado"
    )

    plan = NutritionPlan.model_validate(
        payload
    )

    shopping_list = build_shopping_list(
        plan
    )

    chicken = next(
        item
        for item in shopping_list
        if item.name == "Pechuga de pollo"
    )

    assert chicken.quantity == 400

    assert (
        chicken.productBrand
        == "Mercadona / Hacendado"
    )

    assert len(chicken.sources) == 2

    assert {
        source.date.isoformat()
        for source in chicken.sources
    } == {
        "2026-08-24",
        "2026-08-26",
    }

    assert {
        source.mealName
        for source in chicken.sources
    } == {
        "Pollo con arroz",
        "Pollo con patata",
    }


def test_shopping_list_does_not_merge_different_brands():
    payload = plan_payload()

    first = payload[
        "days"
    ][0]["meals"][0]["ingredients"][0]

    second = payload[
        "days"
    ][1]["meals"][0]["ingredients"][0]

    first["productBrand"] = "Mercadona"
    second["productBrand"] = "Carrefour"

    plan = NutritionPlan.model_validate(
        payload
    )

    shopping_list = build_shopping_list(
        plan
    )

    chicken_items = [
        item
        for item in shopping_list
        if item.name == "Pechuga de pollo"
    ]

    assert len(chicken_items) == 2

    assert {
        item.productBrand
        for item in chicken_items
    } == {
        "Mercadona",
        "Carrefour",
    }

    assert {
        item.quantity
        for item in chicken_items
    } == {
        200,
    }
