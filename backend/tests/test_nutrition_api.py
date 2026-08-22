import httpx
from fastapi.testclient import TestClient

from app.core.auth import AuthenticatedUser, require_user
from app.domains.nutrition.models import NutritionPlan
from main import app


client = TestClient(app)

PLAN_ID = "7d80a518-b080-4c8f-9781-92f39fb5809a"


async def authenticated_user():
    return AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="token-123",
    )


def nutrition_payload(
    plan_id=PLAN_ID,
    week_start="2026-08-24",
):
    return {
        "planId": plan_id,
        "schemaVersion": "1.0",
        "weekStart": week_start,
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
                "date": week_start,
                "meals": [
                    {
                        "mealId": "meal-lunch",
                        "type": "lunch",
                        "name": "Pollo con arroz",
                        "ingredients": [
                            {
                                "ingredientId": "chicken",
                                "name": "Pechuga de pollo",
                                "productBrand": "Mercadona",
                                "quantity": 200,
                                "unit": "g",
                                "measurementBasis": "product",
                                "nutritionPer100g": {
                                    "calories": 110,
                                    "protein": 23,
                                    "carbs": 0,
                                    "fat": 2,
                                },
                            },
                            {
                                "ingredientId": "rice",
                                "name": "Arroz basmati",
                                "productBrand": "Hacendado",
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


def nutrition_model():
    return NutritionPlan.model_validate(
        nutrition_payload()
    )


def test_list_nutrition_plans(monkeypatch):
    from app.domains.nutrition import router as nutrition_api

    async def fake_list(user):
        assert user.id == "user-123"
        return [nutrition_model()]

    app.dependency_overrides[
        require_user
    ] = authenticated_user

    monkeypatch.setattr(
        nutrition_api,
        "list_user_nutrition_plans",
        fake_list,
    )

    try:
        response = client.get(
            "/api/v1/nutrition/plans",
            headers={
                "Authorization": "Bearer token-123"
            },
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["planId"] == PLAN_ID


def test_create_nutrition_plan(monkeypatch):
    from app.domains.nutrition import router as nutrition_api

    async def fake_create(user, plan):
        assert user.id == "user-123"
        assert str(plan.planId) == PLAN_ID
        return plan

    app.dependency_overrides[
        require_user
    ] = authenticated_user

    monkeypatch.setattr(
        nutrition_api,
        "create_user_nutrition_plan",
        fake_create,
    )

    try:
        response = client.post(
            "/api/v1/nutrition/plans",
            headers={
                "Authorization": "Bearer token-123"
            },
            json=nutrition_payload(),
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 201
    assert response.json()["goal"] == "lose_fat"
    assert (
        response.json()["days"][0]
        ["meals"][0]["ingredients"][0]
        ["productBrand"]
        == "Mercadona"
    )


def test_duplicate_plan_returns_409(monkeypatch):
    from app.domains.nutrition import router as nutrition_api

    async def fake_create(user, plan):
        raise httpx.HTTPStatusError(
            "conflict",
            request=httpx.Request(
                "POST",
                "https://example.supabase.co",
            ),
            response=httpx.Response(409),
        )

    app.dependency_overrides[
        require_user
    ] = authenticated_user

    monkeypatch.setattr(
        nutrition_api,
        "create_user_nutrition_plan",
        fake_create,
    )

    try:
        response = client.post(
            "/api/v1/nutrition/plans",
            headers={
                "Authorization": "Bearer token-123"
            },
            json=nutrition_payload(),
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Nutrition plan already exists"
    }


def test_get_missing_plan_returns_404(monkeypatch):
    from app.domains.nutrition import router as nutrition_api

    async def fake_get(user, plan_id):
        return None

    app.dependency_overrides[
        require_user
    ] = authenticated_user

    monkeypatch.setattr(
        nutrition_api,
        "get_user_nutrition_plan_by_id",
        fake_get,
    )

    try:
        response = client.get(
            f"/api/v1/nutrition/plans/{PLAN_ID}",
            headers={
                "Authorization": "Bearer token-123"
            },
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Nutrition plan not found"
    }


def test_replace_rejects_id_mismatch():
    app.dependency_overrides[
        require_user
    ] = authenticated_user

    try:
        response = client.put(
            "/api/v1/nutrition/plans/"
            "11111111-1111-1111-1111-111111111111",
            headers={
                "Authorization": "Bearer token-123"
            },
            json=nutrition_payload(),
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 422
    assert response.json() == {
        "detail": "plan_id must match planId"
    }


def test_delete_plan_returns_204(monkeypatch):
    from app.domains.nutrition import router as nutrition_api

    async def fake_delete(user, plan_id):
        assert plan_id == PLAN_ID
        return True

    app.dependency_overrides[
        require_user
    ] = authenticated_user

    monkeypatch.setattr(
        nutrition_api,
        "delete_user_nutrition_plan",
        fake_delete,
    )

    try:
        response = client.delete(
            f"/api/v1/nutrition/plans/{PLAN_ID}",
            headers={
                "Authorization": "Bearer token-123"
            },
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 204
    assert response.content == b""


def test_shopping_list_is_derived_from_plan(
    monkeypatch,
):
    from app.domains.nutrition import router as nutrition_api

    async def fake_get(user, plan_id):
        return nutrition_model()

    app.dependency_overrides[
        require_user
    ] = authenticated_user

    monkeypatch.setattr(
        nutrition_api,
        "get_user_nutrition_plan_by_id",
        fake_get,
    )

    try:
        response = client.get(
            f"/api/v1/nutrition/plans/"
            f"{PLAN_ID}/shopping-list",
            headers={
                "Authorization": "Bearer token-123"
            },
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 200

    assert response.json() == [
        {
            "name": "Arroz basmati",
            "unit": "g",
            "quantity": 85.0,
        },
        {
            "name": "Pechuga de pollo",
            "unit": "g",
            "quantity": 200.0,
        },
    ]


def test_nutrition_requires_authentication():
    response = client.get(
        "/api/v1/nutrition/plans"
    )

    assert response.status_code == 401
