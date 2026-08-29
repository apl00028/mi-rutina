from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.core.auth import AuthenticatedUser, require_user
from app.domains.swimming.models import SwimmingFitSession
from main import app


client = TestClient(app)


async def authenticated_user():
    return AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="token-123",
    )


def test_swimming_fit_import_requires_authentication():
    response = client.post(
        "/api/v1/swimming/import-fit",
        files={
            "file": (
                "activity.fit",
                b"fit-data",
                "application/octet-stream",
            )
        },
    )

    assert response.status_code == 401
    assert response.json() == {
        "detail": "Missing bearer token"
    }


def test_swimming_fit_import_rejects_non_fit_file():
    app.dependency_overrides[
        require_user
    ] = authenticated_user

    try:
        response = client.post(
            "/api/v1/swimming/import-fit",
            headers={
                "Authorization":
                    "Bearer token-123"
            },
            files={
                "file": (
                    "activity.txt",
                    b"not-fit",
                    "text/plain",
                )
            },
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 415
    assert response.json() == {
        "detail": "Only FIT files are supported"
    }


def test_swimming_fit_import_rejects_empty_file():
    app.dependency_overrides[
        require_user
    ] = authenticated_user

    try:
        response = client.post(
            "/api/v1/swimming/import-fit",
            headers={
                "Authorization":
                    "Bearer token-123"
            },
            files={
                "file": (
                    "activity.fit",
                    b"",
                    "application/octet-stream",
                )
            },
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 422
    assert response.json() == {
        "detail": "FIT file is empty"
    }


def test_swimming_fit_import_returns_parsed_session(
    monkeypatch,
):
    from app.domains.swimming import router as swimming_api

    async def fake_import_user_swimming_fit(user, path, contents):
        assert user.id == "user-123"
        assert path.exists()
        assert path.suffix == ".fit"
        assert contents == b"fake-fit-data"

        return SwimmingFitSession(
            start_time=datetime(
                2026,
                8,
                27,
                15,
                51,
                58,
                tzinfo=timezone.utc,
            ),
            pool_length_meters=25,
            distance_meters=1200,
            total_timer_time_seconds=2439,
            total_moving_time_seconds=2016,
            heart_rate_average_bpm=138,
            heart_rate_max_bpm=162,
            total_strokes=758,
            average_stroke_rate_spm=23,
            average_speed_meters_per_second=0.595,
            max_speed_meters_per_second=1.724,
            average_pace_seconds_per_100m=168.07,
            total_calories=389,
            aerobic_training_effect=3.3,
            anaerobic_training_effect=2.3,
            lengths=[],
        )

    monkeypatch.setattr(
        swimming_api,
        "import_user_swimming_fit",
        fake_import_user_swimming_fit,
    )

    app.dependency_overrides[
        require_user
    ] = authenticated_user

    try:
        response = client.post(
            "/api/v1/swimming/import-fit",
            headers={
                "Authorization":
                    "Bearer token-123"
            },
            files={
                "file": (
                    "activity.fit",
                    b"fake-fit-data",
                    "application/octet-stream",
                )
            },
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 200

    payload = response.json()

    assert payload["distance_meters"] == 1200
    assert payload["pool_length_meters"] == 25
    assert payload["total_timer_time_seconds"] == 2439
    assert payload["total_moving_time_seconds"] == 2016
    assert payload["heart_rate_average_bpm"] == 138
    assert payload["heart_rate_max_bpm"] == 162
    assert payload["total_strokes"] == 758
    assert payload["average_stroke_rate_spm"] == 23
    assert payload["average_speed_meters_per_second"] == 0.595
    assert payload["max_speed_meters_per_second"] == 1.724
    assert payload["average_pace_seconds_per_100m"] == 168.07
    assert payload["total_calories"] == 389
    assert payload["aerobic_training_effect"] == 3.3
    assert payload["anaerobic_training_effect"] == 2.3


def test_swimming_fit_import_rejects_invalid_fit(
    monkeypatch,
):
    from app.domains.swimming import router as swimming_api

    async def fake_import_user_swimming_fit(user, path, contents):
        raise ValueError("invalid FIT")

    monkeypatch.setattr(
        swimming_api,
        "import_user_swimming_fit",
        fake_import_user_swimming_fit,
    )

    app.dependency_overrides[
        require_user
    ] = authenticated_user

    try:
        response = client.post(
            "/api/v1/swimming/import-fit",
            headers={
                "Authorization":
                    "Bearer token-123"
            },
            files={
                "file": (
                    "activity.fit",
                    b"invalid",
                    "application/octet-stream",
                )
            },
        )
    finally:
        app.dependency_overrides.pop(
            require_user,
            None,
        )

    assert response.status_code == 422
    assert response.json() == {
        "detail": "Invalid or unsupported FIT file"
    }
