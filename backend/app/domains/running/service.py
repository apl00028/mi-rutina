from datetime import timezone
from typing import Any

import httpx

from app.core.auth import AuthenticatedUser
from app.domains.exercises.custom_repository import SupabaseConfigError
from app.domains.running.models import (
    RunningData, RunningHealthConnectSession, RunningSession, RunningSyncError,
    RunningSyncItem, RunningSyncRequest, RunningSyncResult,
)
from app.domains.running.repository import list_running_sessions, upsert_running_session


# Only fields accepted by running-sessions.sql; derived values and read errors
# are not persisted. An errored subread must not clear previously stored data.
METRICS = {
    "distanceMeters": ("distance_meters", "distanceError"),
    "heartRateAverageBpm": ("heart_rate_average_bpm", "heartRateError"),
    "heartRateMaxBpm": ("heart_rate_max_bpm", "heartRateError"),
    "heartRateSampleCount": ("heart_rate_sample_count", "heartRateError"),
    "speedAverageMetersPerSecond": ("speed_average_meters_per_second", "speedError"),
    "speedMaxMetersPerSecond": ("speed_max_meters_per_second", "speedError"),
    "speedSampleCount": ("speed_sample_count", "speedError"),
    "lapCount": ("lap_count", None),
    "segmentCount": ("segment_count", None),
    "hasRoute": ("has_route", None),
}


def running_to_rpc_payload(session: RunningHealthConnectSession) -> dict[str, Any]:
    data = {"schema_version": 1, "exercise_type": session.exerciseType}
    for native, (stored, error) in METRICS.items():
        if native in session.model_fields_set and not (error and getattr(session, error)):
            data[stored] = getattr(session, native)
    return {
        "source_package": session.sourcePackage,
        "source_record_id": session.recordId,
        "started_at": session.startTime.astimezone(timezone.utc).isoformat(),
        "ended_at": session.endTime.astimezone(timezone.utc).isoformat(),
        "data": RunningData.model_validate(data).model_dump(exclude_unset=True),
    }


def running_row_to_model(row: dict[str, Any]) -> RunningSession:
    return RunningSession.model_validate({
        key: value for key, value in row.items()
        if key not in {"user_id", "created_at", "updated_at"}
    })


def running_service_error(exc: Exception) -> RunningSyncError:
    if isinstance(exc, SupabaseConfigError):
        return RunningSyncError(status_code=503, detail="Running service is not configured")
    return RunningSyncError(status_code=502, detail="Running service is unavailable")


async def sync_user_running_health_connect(
    user: AuthenticatedUser, request: RunningSyncRequest,
) -> RunningSyncResult:
    results = []
    # Sequential calls make repeated identities in a batch predictable. Each
    # RPC is atomic; this batch is deliberately not a database transaction.
    for index, session in enumerate(request.sessions):
        item = RunningSyncItem(index=index, recordId=session.recordId, sourcePackage=session.sourcePackage)
        try:
            row = await upsert_running_session(user, running_to_rpc_payload(session))
            item.session = running_row_to_model(row)
        except (httpx.HTTPError, RuntimeError, ValueError) as exc:
            item.error = running_service_error(exc)
        results.append(item)
    return RunningSyncResult(synced=sum(item.session is not None for item in results), results=results)


async def list_user_running_sessions(user: AuthenticatedUser) -> list[RunningSession]:
    return [running_row_to_model(row) for row in await list_running_sessions(user)]
