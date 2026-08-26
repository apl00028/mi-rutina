from fastapi.testclient import TestClient

from main import app
from app.core.auth import (
    AuthenticatedUser,
    require_user,
)


client = TestClient(app)


def authenticated_user():
    return AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="access-token",
        plan="trial",
        role="user",
    )


def test_telemetry_requires_authentication():
    response = client.post(
        "/api/v1/telemetry/events",
        json={
            "event_name":
                "page_view",
            "route":
                "/salud",
        },
    )

    assert response.status_code == 401


def test_telemetry_records_valid_event(
    monkeypatch,
):
    from app.domains.telemetry import (
        router as telemetry_router,
    )

    recorded = []

    async def fake_record_event(
        user,
        event,
    ):
        recorded.append(
            {
                "user_id":
                    user.id,
                "event_name":
                    event.event_name,
                "route":
                    event.route,
                "platform":
                    event.platform,
                "app_version":
                    event.app_version,
                "metadata":
                    event.metadata,
            }
        )

    monkeypatch.setattr(
        telemetry_router,
        "record_event",
        fake_record_event,
    )

    app.dependency_overrides[
        require_user
    ] = authenticated_user

    try:
        response = client.post(
            "/api/v1/telemetry/events",
            json={
                "event_name":
                    "page_view",
                "route":
                    "/salud",
                "platform":
                    "android",
                "app_version":
                    "1.0",
                "metadata": {},
            },
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 204
    assert response.content == b""

    assert recorded == [
        {
            "user_id":
                "user-123",
            "event_name":
                "page_view",
            "route":
                "/salud",
            "platform":
                "android",
            "app_version":
                "1.0",
            "metadata": {},
        }
    ]


def test_telemetry_rejects_unknown_event():
    app.dependency_overrides[
        require_user
    ] = authenticated_user

    try:
        response = client.post(
            "/api/v1/telemetry/events",
            json={
                "event_name":
                    "everything_user_did",
            },
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 422


def test_telemetry_rejects_oversized_route():
    app.dependency_overrides[
        require_user
    ] = authenticated_user

    try:
        response = client.post(
            "/api/v1/telemetry/events",
            json={
                "event_name":
                    "page_view",
                "route":
                    "/" + (
                        "x" * 200
                    ),
            },
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 422
