from asyncio import run
from inspect import signature

import httpx

from auth import AuthenticatedUser
from auth import require_user
from app.api.v1 import analytics as analytics_api
from app.models.training_analytics import (
    TrainingAnalyticsResponse,
    TrainingAnalyticsSummary,
)
from main import app


def authenticated_user():
    return AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="token-123",
    )


def response_model(period="4w"):
    return TrainingAnalyticsResponse(
        period=period,
        fromDate="2026-07-23T00:00:00+00:00",
        toDate="2026-08-20T00:00:00+00:00",
        summary=TrainingAnalyticsSummary(
            workouts=1,
            completedSets=2,
            totalVolume=1000,
            uniqueExercises=1,
        ),
        muscleGroups=[],
        exercises=[],
        progress=[],
    )


def test_training_analytics_endpoint_does_not_accept_user_id():
    params = signature(
        analytics_api.training_analytics
    ).parameters

    assert "user_id" not in params


def test_training_analytics_appears_in_openapi():
    schema = app.openapi()
    path = schema["paths"].get(
        "/api/v1/analytics/training"
    )

    assert path is not None
    assert "get" in path


def test_training_analytics_without_auth_is_not_404():
    async def request():
        transport = httpx.ASGITransport(
            app=app
        )

        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.get(
                "/api/v1/analytics/training?period=4w"
            )

    response = run(request())

    assert response.status_code in (
        401,
        403,
    )


def test_training_analytics_asgi_request_reaches_handler(monkeypatch):
    async def fake_require_user():
        return authenticated_user()

    async def fake_get_training_analytics(
        user,
        *,
        period,
    ):
        assert user.id == "user-123"
        assert period == "6m"
        return response_model(
            period
        )

    async def request():
        transport = httpx.ASGITransport(
            app=app
        )

        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.get(
                "/api/v1/analytics/training?period=6m",
                headers={
                    "Authorization":
                        "Bearer token-123"
                },
            )

    app.dependency_overrides[
        require_user
    ] = fake_require_user
    monkeypatch.setattr(
        analytics_api,
        "get_training_analytics",
        fake_get_training_analytics,
    )

    try:
        response = run(request())
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 200
    assert response.json()["period"] == "6m"


def test_training_analytics_endpoint_uses_authenticated_user(monkeypatch):
    async def fake_get_training_analytics(
        user,
        *,
        period,
    ):
        assert user.id == "user-123"
        assert period == "3m"
        return response_model(
            period
        )

    monkeypatch.setattr(
        analytics_api,
        "get_training_analytics",
        fake_get_training_analytics,
    )

    result = run(
        analytics_api.training_analytics(
            period="3m",
            user=authenticated_user(),
        )
    )

    assert result.period == "3m"
    assert result.summary.workouts == 1
