from fastapi.testclient import TestClient

from app.core.auth import AuthenticatedUser, require_user
from main import app


client = TestClient(app)


async def normal_user():
    return AuthenticatedUser(
        id="user-123",
        email="user@example.com",
        access_token="token-123",
        role="user",
    )


async def trainer_user():
    return AuthenticatedUser(
        id="trainer-123",
        email="trainer@example.com",
        access_token="token-123",
        role="trainer",
    )


async def admin_user():
    return AuthenticatedUser(
        id="admin-123",
        email="admin@example.com",
        access_token="token-123",
        role="admin",
    )


def test_trainer_athletes_requires_authentication():
    response = client.get(
        "/api/v1/trainer/athletes"
    )

    assert response.status_code == 401
    assert response.json() == {
        "detail": "Missing bearer token"
    }


def test_normal_user_cannot_list_trainer_athletes():
    app.dependency_overrides[
        require_user
    ] = normal_user

    try:
        response = client.get(
            "/api/v1/trainer/athletes",
            headers={
                "Authorization":
                    "Bearer token-123"
            },
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Trainer access required"
    }


def test_admin_cannot_list_trainer_athletes():
    app.dependency_overrides[
        require_user
    ] = admin_user

    try:
        response = client.get(
            "/api/v1/trainer/athletes",
            headers={
                "Authorization":
                    "Bearer token-123"
            },
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Trainer access required"
    }


def test_trainer_can_list_active_athlete_relationships(monkeypatch):
    from app.domains.trainer import router as trainer_api

    async def fake_list(trainer):
        assert trainer.id == "trainer-123"
        return [
            {
                "athlete_id": "athlete-1",
                "status": "active",
            }
        ]

    app.dependency_overrides[
        require_user
    ] = trainer_user
    monkeypatch.setattr(
        trainer_api,
        "list_authenticated_trainer_athletes",
        fake_list,
    )

    try:
        response = client.get(
            "/api/v1/trainer/athletes",
            headers={
                "Authorization":
                    "Bearer token-123"
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
            "athlete_id": "athlete-1",
            "status": "active",
        }
    ]


def test_trainer_athletes_route_does_not_accept_trainer_id_parameter(
    monkeypatch,
):
    from app.domains.trainer import router as trainer_api

    seen = []

    async def fake_list(trainer):
        seen.append(trainer.id)
        return []

    app.dependency_overrides[
        require_user
    ] = trainer_user
    monkeypatch.setattr(
        trainer_api,
        "list_authenticated_trainer_athletes",
        fake_list,
    )

    try:
        response = client.get(
            (
                "/api/v1/trainer/athletes"
                "?trainer_id=other-trainer"
            ),
            headers={
                "Authorization":
                    "Bearer token-123"
            },
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 200
    assert seen == [
        "trainer-123"
    ]

    route = next(
        route
        for route in app.routes
        if getattr(route, "path", None)
        == "/api/v1/trainer/athletes"
    )
    assert [
        param.name
        for param in route.dependant.query_params
    ] == []
