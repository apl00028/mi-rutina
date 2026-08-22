from datetime import date
from uuid import UUID

from fastapi.testclient import TestClient

from app.core.auth import (
    AuthenticatedUser,
    require_user,
)
from app.domains.health_tracking.models import (
    WeeklyCheckIn,
    WeightEntry,
)
from main import app


client = TestClient(app)

ENTRY_ID = UUID(
    "11111111-1111-1111-1111-111111111111"
)


async def authenticated_user():
    return AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="token-123",
    )


def weight_entry():
    return WeightEntry(
        id=ENTRY_ID,
        measurementDate=date(
            2026,
            8,
            24,
        ),
        weightKg=75.4,
        bodyFatPercent=18.2,
        source="manual",
    )


def weekly_checkin():
    return WeeklyCheckIn(
        id=ENTRY_ID,
        weekStart=date(
            2026,
            8,
            24,
        ),
        fatigue=3,
        hunger=2,
        recovery=4,
        dietAdherencePercent=90,
    )


def test_list_weights(
    monkeypatch,
):
    from app.domains.health_tracking import (
        router as health_api,
    )

    async def fake_list(user):
        assert user.id == "user-123"
        return [weight_entry()]

    app.dependency_overrides[
        require_user
    ] = authenticated_user

    monkeypatch.setattr(
        health_api,
        "list_user_weight_entries",
        fake_list,
    )

    try:
        response = client.get(
            "/api/v1/health/weights",
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

    assert response.json()[0][
        "weightKg"
    ] == 75.4


def test_save_weight(
    monkeypatch,
):
    from app.domains.health_tracking import (
        router as health_api,
    )

    async def fake_save(
        user,
        measurement_date,
        request,
    ):
        assert user.id == "user-123"
        assert measurement_date == date(
            2026,
            8,
            24,
        )
        assert request.weightKg == 75.4
        return weight_entry()

    app.dependency_overrides[
        require_user
    ] = authenticated_user

    monkeypatch.setattr(
        health_api,
        "save_user_weight_entry",
        fake_save,
    )

    try:
        response = client.put(
            (
                "/api/v1/health/weights/"
                "2026-08-24"
            ),
            headers={
                "Authorization":
                    "Bearer token-123"
            },
            json={
                "weightKg": 75.4,
                "bodyFatPercent": 18.2,
                "source": "manual",
            },
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 200
    assert (
        response.json()[
            "measurementDate"
        ]
        == "2026-08-24"
    )


def test_delete_weight(
    monkeypatch,
):
    from app.domains.health_tracking import (
        router as health_api,
    )

    async def fake_delete(
        user,
        measurement_date,
    ):
        assert measurement_date == date(
            2026,
            8,
            24,
        )
        return True

    app.dependency_overrides[
        require_user
    ] = authenticated_user

    monkeypatch.setattr(
        health_api,
        "delete_user_weight_entry",
        fake_delete,
    )

    try:
        response = client.delete(
            (
                "/api/v1/health/weights/"
                "2026-08-24"
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

    assert response.status_code == 204


def test_delete_missing_weight_returns_404(
    monkeypatch,
):
    from app.domains.health_tracking import (
        router as health_api,
    )

    async def fake_delete(
        user,
        measurement_date,
    ):
        return False

    app.dependency_overrides[
        require_user
    ] = authenticated_user

    monkeypatch.setattr(
        health_api,
        "delete_user_weight_entry",
        fake_delete,
    )

    try:
        response = client.delete(
            (
                "/api/v1/health/weights/"
                "2026-08-24"
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

    assert response.status_code == 404


def test_list_weekly_checkins(
    monkeypatch,
):
    from app.domains.health_tracking import (
        router as health_api,
    )

    async def fake_list(user):
        return [weekly_checkin()]

    app.dependency_overrides[
        require_user
    ] = authenticated_user

    monkeypatch.setattr(
        health_api,
        "list_user_weekly_checkins",
        fake_list,
    )

    try:
        response = client.get(
            "/api/v1/health/checkins",
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
    assert (
        response.json()[0][
            "dietAdherencePercent"
        ]
        == 90
    )


def test_save_weekly_checkin(
    monkeypatch,
):
    from app.domains.health_tracking import (
        router as health_api,
    )

    async def fake_save(
        user,
        week_start,
        request,
    ):
        assert week_start == date(
            2026,
            8,
            24,
        )
        assert request.fatigue == 3
        return weekly_checkin()

    app.dependency_overrides[
        require_user
    ] = authenticated_user

    monkeypatch.setattr(
        health_api,
        "save_user_weekly_checkin",
        fake_save,
    )

    try:
        response = client.put(
            (
                "/api/v1/health/checkins/"
                "2026-08-24"
            ),
            headers={
                "Authorization":
                    "Bearer token-123"
            },
            json={
                "fatigue": 3,
                "hunger": 2,
                "recovery": 4,
                "dietAdherencePercent":
                    90,
            },
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 200
    assert (
        response.json()["weekStart"]
        == "2026-08-24"
    )


def test_checkin_rejects_non_monday():
    app.dependency_overrides[
        require_user
    ] = authenticated_user

    try:
        response = client.put(
            (
                "/api/v1/health/checkins/"
                "2026-08-25"
            ),
            headers={
                "Authorization":
                    "Bearer token-123"
            },
            json={
                "fatigue": 3,
            },
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 422
    assert response.json() == {
        "detail":
            "week_start must be a Monday"
    }


def test_health_requires_authentication():
    response = client.get(
        "/api/v1/health/weights"
    )

    assert response.status_code == 401
