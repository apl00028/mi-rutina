from hashlib import sha256
from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.auth import AuthenticatedUser
from app.domains.swimming.fit_parser import (
    parse_swimming_fit,
)
from app.domains.swimming.models import (
    SwimmingHealthConnectSession,
    SwimmingHealthConnectSyncRequest,
    SwimmingHealthConnectSyncResult,
    SwimmingFitSession,
)
from app.domains.swimming.repository import (
    create_swimming_session,
    get_swimming_session_by_hash,
    list_swimming_sessions,
    upsert_swimming_sessions,
)


PARSER_VERSION = 1
HEALTH_CONNECT_PARSER_VERSION = 1


def swimming_row_to_model(
    row: dict[str, Any],
) -> SwimmingFitSession:
    data = row.get("data")

    if not isinstance(data, dict):
        raise RuntimeError(
            "Unexpected Supabase response."
        )

    return SwimmingFitSession.model_validate(
        data
    )


def swimming_to_storage_payload(
    session: SwimmingFitSession,
    source_file_hash: str,
) -> dict[str, Any]:
    if session.start_time is None:
        raise ValueError(
            "Swimming FIT session has no start time"
        )

    return {
        "id":
            f"garmin-fit-{source_file_hash[:24]}",
        "source":
            "garmin_fit",
        "source_file_hash":
            source_file_hash,
        "started_at":
            session.start_time.isoformat(),
        "parser_version":
            PARSER_VERSION,
        "data":
            session.model_dump(
                mode="json",
                exclude_none=True,
            ),
    }


async def list_user_swimming_sessions(
    user: AuthenticatedUser,
) -> list[SwimmingFitSession]:
    rows = await list_swimming_sessions(
        user
    )

    return [
        swimming_row_to_model(row)
        for row in rows
    ]


async def import_user_swimming_fit(
    user: AuthenticatedUser,
    path,
    contents: bytes,
) -> SwimmingFitSession:
    source_file_hash = sha256(
        contents
    ).hexdigest()

    existing = (
        await get_swimming_session_by_hash(
            user,
            source_file_hash,
        )
    )

    if existing is not None:
        return swimming_row_to_model(
            existing
        )

    session = parse_swimming_fit(path)

    payload = swimming_to_storage_payload(
        session,
        source_file_hash,
    )

    try:
        row = await create_swimming_session(
            user,
            payload,
        )
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code != 409:
            raise

        existing = await get_swimming_session_by_hash(
            user,
            source_file_hash,
        )

        if existing is None:
            raise

        row = existing

    return swimming_row_to_model(
        row
    )


def _utc_iso(value) -> str:
    return (
        value
        .astimezone(timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
    )


def _optional_number_key(value: float | int | None) -> str:
    if value is None:
        return ""

    return f"{float(value):.3f}"


def health_connect_swimming_session_id(
    session: SwimmingHealthConnectSession,
) -> str:
    stable_parts = [
        session.sourcePackage.strip(),
        _utc_iso(session.startTime),
        _utc_iso(session.endTime),
        _optional_number_key(session.distanceMeters),
        _optional_number_key(session.durationSeconds),
    ]

    digest = sha256(
        "\x1f".join(stable_parts).encode("utf-8")
    ).hexdigest()

    return f"health-connect:{digest[:32]}"


def _health_connect_session_data(
    session: SwimmingHealthConnectSession,
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "start_time":
            _utc_iso(session.startTime),
        "total_elapsed_time_seconds":
            session.durationSeconds,
        "total_timer_time_seconds":
            session.durationSeconds,
        "lengths":
            [],
        "health_connect": {
            "source_package":
                session.sourcePackage,
            "end_time":
                _utc_iso(session.endTime),
            "duration_seconds":
                session.durationSeconds,
            "segment_count":
                session.segmentCount,
            "segment_repetitions":
                session.segmentRepetitions,
            "distance_record_count":
                session.distanceRecordCount,
            "raw_distance_total_meters":
                session.rawDistanceTotalMeters,
            "heart_rate_sample_count":
                session.heartRateSampleCount,
            "speed_sample_count":
                session.speedSampleCount,
        },
    }

    if session.distanceMeters is not None:
        data["distance_meters"] = session.distanceMeters

    if session.segmentRepetitions > 0:
        data["total_strokes"] = session.segmentRepetitions

    if session.heartRateAverageBpm is not None:
        data["heart_rate_average_bpm"] = (
            session.heartRateAverageBpm
        )

    if session.heartRateMaxBpm is not None:
        data["heart_rate_max_bpm"] = (
            session.heartRateMaxBpm
        )

    if (
        session.speedAverageMetersPerSecond
        is not None
    ):
        data["average_speed_meters_per_second"] = (
            session.speedAverageMetersPerSecond
        )

    if session.speedMaxMetersPerSecond is not None:
        data["max_speed_meters_per_second"] = (
            session.speedMaxMetersPerSecond
        )

    if session.distanceRecords:
        data["health_connect"][
            "distance_records"
        ] = [
            record.model_dump(
                mode="json",
            )
            for record in session.distanceRecords
        ]

    if (
        session.paceSecondsPer100mFromSpeed
        is not None
    ):
        data["health_connect"][
            "pace_seconds_per_100m_from_speed"
        ] = session.paceSecondsPer100mFromSpeed

    return data


def health_connect_swimming_to_storage_payload(
    session: SwimmingHealthConnectSession,
) -> dict[str, Any]:
    now = datetime.now(
        timezone.utc
    ).isoformat()

    return {
        "id":
            health_connect_swimming_session_id(
                session
            ),
        "source":
            "health_connect",
        "source_file_hash":
            None,
        "started_at":
            _utc_iso(session.startTime),
        "parser_version":
            HEALTH_CONNECT_PARSER_VERSION,
        "data":
            _health_connect_session_data(
                session
            ),
        "updated_at":
            now,
    }


def _row_distance(row: dict[str, Any]) -> float | None:
    data = row.get("data")

    if not isinstance(data, dict):
        return None

    value = data.get("distance_meters")

    return (
        float(value)
        if isinstance(value, (int, float))
        else None
    )


def _row_duration(row: dict[str, Any]) -> float | None:
    data = row.get("data")

    if not isinstance(data, dict):
        return None

    for key in (
        "total_timer_time_seconds",
        "total_elapsed_time_seconds",
        "total_moving_time_seconds",
    ):
        value = data.get(key)

        if isinstance(value, (int, float)):
            return float(value)

    return None


def _row_started_at(row: dict[str, Any]):
    value = row.get("started_at")

    if not isinstance(value, str):
        data = row.get("data")
        if isinstance(data, dict):
            value = data.get("start_time")

    if not isinstance(value, str):
        return None

    try:
        return datetime.fromisoformat(
            value.replace("Z", "+00:00")
        )
    except ValueError:
        return None


def _is_probable_fit_equivalent(
    session: SwimmingHealthConnectSession,
    row: dict[str, Any],
) -> bool:
    if row.get("source") != "garmin_fit":
        return False

    started_at = _row_started_at(row)

    if started_at is None:
        return False

    time_difference_seconds = abs(
        (
            started_at.astimezone(timezone.utc)
            - session.startTime.astimezone(
                timezone.utc
            )
        ).total_seconds()
    )

    if time_difference_seconds > 120:
        return False

    row_distance = _row_distance(row)

    if (
        row_distance is not None
        and session.distanceMeters is not None
        and abs(row_distance - session.distanceMeters) > 5
    ):
        return False

    row_duration = _row_duration(row)

    if (
        row_duration is not None
        and abs(
            row_duration - session.durationSeconds
        ) > 120
    ):
        return False

    return True


async def sync_user_swimming_health_connect(
    user: AuthenticatedUser,
    request: SwimmingHealthConnectSyncRequest,
) -> SwimmingHealthConnectSyncResult:
    existing_rows = await list_swimming_sessions(
        user
    )

    payloads = [
        health_connect_swimming_to_storage_payload(
            session
        )
        for session in request.sessions
        if not any(
            _is_probable_fit_equivalent(
                session,
                row,
            )
            for row in existing_rows
        )
    ]

    rows = await upsert_swimming_sessions(
        user,
        payloads,
    )

    return SwimmingHealthConnectSyncResult(
        synced=len(rows)
    )
