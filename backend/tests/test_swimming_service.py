from datetime import datetime, timezone

import asyncio
import httpx

from app.core.auth import AuthenticatedUser
from app.domains.swimming.models import (
    SwimmingFitSession,
    SwimmingHealthConnectSession,
    SwimmingHealthConnectSyncRequest,
)
from app.domains.swimming.service import (
    health_connect_swimming_session_id,
    health_connect_swimming_to_storage_payload,
    import_user_swimming_fit,
    swimming_to_storage_payload,
    sync_user_swimming_health_connect,
)
USER = AuthenticatedUser(
    id="user-123",
    email="test@example.com",
    access_token="token-123",
)


def sample_session():
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
        total_strokes=758,
        lengths=[],
    )


def test_swimming_storage_payload_is_stable():
    session = sample_session()

    payload = swimming_to_storage_payload(
        session,
        "a" * 64,
    )

    assert payload["id"] == (
        "garmin-fit-" + "a" * 24
    )
    assert payload["source"] == "garmin_fit"
    assert payload["source_file_hash"] == "a" * 64
    assert payload["parser_version"] == 1
    assert payload["started_at"] == (
        "2026-08-27T15:51:58+00:00"
    )
    assert payload["data"]["distance_meters"] == 1200


def test_new_fit_is_parsed_and_created(
    monkeypatch,
    tmp_path,
):
    from app.domains.swimming import service

    path = tmp_path / "activity.fit"
    contents = b"fit-contents"
    path.write_bytes(contents)

    session = sample_session()

    async def fake_get(user, source_file_hash):
        assert user.id == "user-123"
        assert len(source_file_hash) == 64
        return None

    def fake_parse(parsed_path):
        assert parsed_path == path
        return session

    async def fake_create(user, payload):
        assert user.id == "user-123"
        assert payload["source"] == "garmin_fit"
        assert payload["data"]["total_strokes"] == 758

        return {
            "data": payload["data"],
        }

    monkeypatch.setattr(
        service,
        "get_swimming_session_by_hash",
        fake_get,
    )
    monkeypatch.setattr(
        service,
        "parse_swimming_fit",
        fake_parse,
    )
    monkeypatch.setattr(
        service,
        "create_swimming_session",
        fake_create,
    )

    result = asyncio.run(
        import_user_swimming_fit(
            USER,
            path,
            contents,
        )
    )

    assert result.distance_meters == 1200
    assert result.total_strokes == 758


def test_existing_fit_is_returned_without_reparse(
    monkeypatch,
    tmp_path,
):
    from app.domains.swimming import service

    path = tmp_path / "activity.fit"
    contents = b"same-fit"
    path.write_bytes(contents)

    existing = sample_session().model_dump(
        mode="json",
        exclude_none=True,
    )

    async def fake_get(user, source_file_hash):
        return {
            "data": existing,
        }

    def fail_parse(path):
        raise AssertionError(
            "existing FIT must not be reparsed"
        )

    async def fail_create(user, payload):
        raise AssertionError(
            "existing FIT must not be recreated"
        )

    monkeypatch.setattr(
        service,
        "get_swimming_session_by_hash",
        fake_get,
    )
    monkeypatch.setattr(
        service,
        "parse_swimming_fit",
        fail_parse,
    )
    monkeypatch.setattr(
        service,
        "create_swimming_session",
        fail_create,
    )

    result = asyncio.run(
        import_user_swimming_fit(
            USER,
            path,
            contents,
        )
    )

    assert result.distance_meters == 1200
    assert result.total_strokes == 758


def test_unique_conflict_returns_concurrently_created_fit(
    monkeypatch,
    tmp_path,
):
    from app.domains.swimming import service

    path = tmp_path / "activity.fit"
    contents = b"concurrent-fit"
    path.write_bytes(contents)
    stored_data = sample_session().model_dump(
        mode="json",
        exclude_none=True,
    )
    reads = 0

    async def fake_get(user, source_file_hash):
        nonlocal reads
        reads += 1
        return None if reads == 1 else {"data": stored_data}

    async def fake_create(user, payload):
        request = httpx.Request(
            "POST",
            "https://example.test/swimming_sessions",
        )
        response = httpx.Response(409, request=request)
        raise httpx.HTTPStatusError(
            "duplicate key",
            request=request,
            response=response,
        )

    monkeypatch.setattr(
        service,
        "get_swimming_session_by_hash",
        fake_get,
    )
    monkeypatch.setattr(
        service,
        "parse_swimming_fit",
        lambda parsed_path: sample_session(),
    )
    monkeypatch.setattr(
        service,
        "create_swimming_session",
        fake_create,
    )

    result = asyncio.run(
        import_user_swimming_fit(USER, path, contents)
    )

    assert reads == 2
    assert result.distance_meters == 1200


def test_list_user_swimming_sessions(
    monkeypatch,
):
    from app.domains.swimming import service

    session = sample_session()

    async def fake_list(user):
        assert user.id == "user-123"
        return [
            {
                "data": session.model_dump(
                    mode="json",
                    exclude_none=True,
                )
            }
        ]

    monkeypatch.setattr(
        service,
        "list_swimming_sessions",
        fake_list,
    )

    result = asyncio.run(
        service.list_user_swimming_sessions(
            USER
        )
    )

    assert len(result) == 1
    assert result[0].distance_meters == 1200


def health_connect_session(**overrides):
    payload = {
        "sourcePackage":
            "com.garmin.android.apps.connectmobile",
        "startTime":
            datetime(
                2026,
                9,
                2,
                7,
                0,
                tzinfo=timezone.utc,
            ),
        "endTime":
            datetime(
                2026,
                9,
                2,
                7,
                42,
                tzinfo=timezone.utc,
            ),
        "durationSeconds":
            2520,
        "segmentCount":
            2,
        "segmentRepetitions":
            612,
        "distanceMeters":
            950,
        "distanceRecordCount":
            1,
        "rawDistanceTotalMeters":
            950,
        "distanceRecords": [
            {
                "startTime":
                    datetime(
                        2026,
                        9,
                        2,
                        7,
                        0,
                        tzinfo=timezone.utc,
                    ),
                "endTime":
                    datetime(
                        2026,
                        9,
                        2,
                        7,
                        42,
                        tzinfo=timezone.utc,
                    ),
                "durationSeconds":
                    2520,
                "distanceMeters":
                    950,
            }
        ],
        "heartRateAverageBpm":
            132,
        "heartRateMaxBpm":
            156,
        "heartRateSampleCount":
            120,
        "speedSampleCount":
            60,
        "speedAverageMetersPerSecond":
            0.47,
        "speedMaxMetersPerSecond":
            1.1,
        "paceSecondsPer100mFromSpeed":
            212.7,
    }
    payload.update(overrides)
    return SwimmingHealthConnectSession(
        **payload
    )


def test_health_connect_swimming_payload_uses_stable_id_and_source():
    session = health_connect_session()

    payload = health_connect_swimming_to_storage_payload(
        session
    )

    assert payload["id"].startswith(
        "health-connect:"
    )
    assert payload["id"] == (
        health_connect_swimming_session_id(
            session
        )
    )
    assert payload["source"] == "health_connect"
    assert payload["source_file_hash"] is None
    assert payload["started_at"] == (
        "2026-09-02T07:00:00Z"
    )
    assert payload["data"]["distance_meters"] == 950
    assert payload["data"][
        "total_elapsed_time_seconds"
    ] == 2520
    assert payload["data"][
        "heart_rate_average_bpm"
    ] == 132
    assert payload["data"][
        "average_speed_meters_per_second"
    ] == 0.47
    assert (
        "average_pace_seconds_per_100m"
        not in payload["data"]
    )
    assert payload["data"]["health_connect"][
        "source_package"
    ] == (
        "com.garmin.android.apps.connectmobile"
    )
    assert payload["data"]["health_connect"][
        "pace_seconds_per_100m_from_speed"
    ] == 212.7


def test_health_connect_swimming_retry_keeps_same_id():
    session = health_connect_session()

    assert health_connect_swimming_session_id(
        session
    ) == health_connect_swimming_session_id(
        health_connect_session()
    )


def test_sync_health_connect_swimming_saves_own_sessions(
    monkeypatch,
):
    from app.domains.swimming import service

    captured = {}

    async def fake_list(user):
        assert user.id == "user-123"
        return []

    async def fake_upsert(user, payloads):
        assert user.id == "user-123"
        captured["payloads"] = payloads
        return payloads

    monkeypatch.setattr(
        service,
        "list_swimming_sessions",
        fake_list,
    )
    monkeypatch.setattr(
        service,
        "upsert_swimming_sessions",
        fake_upsert,
    )

    result = asyncio.run(
        sync_user_swimming_health_connect(
            USER,
            SwimmingHealthConnectSyncRequest(
                sessions=[
                    health_connect_session()
                ]
            ),
        )
    )

    assert result.synced == 1
    assert captured["payloads"][0][
        "source"
    ] == "health_connect"
    assert "user_id" not in captured["payloads"][0]


def test_sync_health_connect_swimming_does_not_overwrite_fit(
    monkeypatch,
):
    from app.domains.swimming import service

    async def fake_list(user):
        return [
            {
                "id":
                    "garmin-fit-abc",
                "source":
                    "garmin_fit",
                "started_at":
                    "2026-09-02T07:01:00Z",
                "data": {
                    "distance_meters":
                        952,
                    "total_timer_time_seconds":
                        2500,
                },
            }
        ]

    async def fake_upsert(user, payloads):
        assert payloads == []
        return []

    monkeypatch.setattr(
        service,
        "list_swimming_sessions",
        fake_list,
    )
    monkeypatch.setattr(
        service,
        "upsert_swimming_sessions",
        fake_upsert,
    )

    result = asyncio.run(
        sync_user_swimming_health_connect(
            USER,
            SwimmingHealthConnectSyncRequest(
                sessions=[
                    health_connect_session()
                ]
            ),
        )
    )

    assert result.synced == 0
