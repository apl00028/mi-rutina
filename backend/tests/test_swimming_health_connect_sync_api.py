import asyncio

import pytest
from pydantic import ValidationError

from app.core.auth import AuthenticatedUser
from app.domains.swimming.models import (
    SwimmingHealthConnectSyncRequest,
    SwimmingHealthConnectSyncResult,
)


USER = AuthenticatedUser(
    id="user-123",
    email="test@example.com",
    access_token="token-123",
)


def health_connect_sync_payload():
    return {
        "sessions": [
            {
                "sourcePackage": (
                    "com.garmin.android.apps.connectmobile"
                ),
                "startTime": (
                    "2026-09-02T07:00:00Z"
                ),
                "endTime": (
                    "2026-09-02T07:42:00Z"
                ),
                "durationSeconds": 2520,
                "segmentCount": 2,
                "segmentRepetitions": 612,
                "distanceMeters": 950,
                "distanceRecordCount": 1,
                "rawDistanceTotalMeters": 950,
                "distanceRecords": [
                    {
                        "startTime": (
                            "2026-09-02T07:00:00Z"
                        ),
                        "endTime": (
                            "2026-09-02T07:42:00Z"
                        ),
                        "durationSeconds": 2520,
                        "distanceMeters": 950,
                    }
                ],
                "heartRateAverageBpm": 132,
                "heartRateMaxBpm": 156,
                "heartRateSampleCount": 120,
                "speedSampleCount": 60,
                "speedAverageMetersPerSecond": 0.47,
                "speedMaxMetersPerSecond": 1.1,
                "paceSecondsPer100mFromSpeed": 212.7,
            }
        ]
    }


def test_health_connect_sync_endpoint_uses_authenticated_user(
    monkeypatch,
):
    from app.domains.swimming import router as swimming_api

    async def fake_sync(user, request):
        assert user.id == "user-123"
        assert len(request.sessions) == 1
        assert request.sessions[0].distanceMeters == 950

        return SwimmingHealthConnectSyncResult(
            synced=1
        )

    monkeypatch.setattr(
        swimming_api,
        "sync_user_swimming_health_connect",
        fake_sync,
    )

    result = asyncio.run(
        swimming_api.sync_swimming_health_connect(
            SwimmingHealthConnectSyncRequest(
                **health_connect_sync_payload()
            ),
            USER,
        )
    )

    assert result.synced == 1


def test_health_connect_sync_request_rejects_user_id_override():
    payload = health_connect_sync_payload()
    payload["sessions"][0]["user_id"] = (
        "other-user"
    )

    with pytest.raises(ValidationError):
        SwimmingHealthConnectSyncRequest(
            **payload
        )


def test_health_connect_sync_request_rejects_invalid_payload():
    payload = health_connect_sync_payload()
    payload["sessions"][0][
        "durationSeconds"
    ] = -1

    with pytest.raises(ValidationError):
        SwimmingHealthConnectSyncRequest(
            **payload
        )
