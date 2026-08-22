import httpx
from datetime import date

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Response,
    status,
)

from app.core.auth import (
    AuthenticatedUser,
    require_user,
)
from app.domains.exercises.custom_repository import (
    SupabaseConfigError,
)
from app.domains.health_tracking.models import (
    BodyMeasurement,
    BodyMeasurementInput,
    DailyCheckIn,
    DailyCheckInInput,
    WeeklyCheckIn,
    WeeklyCheckInInput,
    WeightEntry,
    WeightEntryInput,
    WeightTrendSummary,
)
from app.domains.health_tracking.service import (
    build_weight_trend,
    delete_user_weight_entry,
    list_user_body_measurements,
    list_user_daily_checkins,
    list_user_weekly_checkins,
    list_user_weight_entries,
    save_user_body_measurement,
    save_user_daily_checkin,
    save_user_weekly_checkin,
    save_user_weight_entry,
)


router = APIRouter(
    prefix="/health",
    tags=["Health"],
)


def _raise_health_http_error(
    exc: Exception,
) -> None:
    if isinstance(
        exc,
        SupabaseConfigError,
    ):
        raise HTTPException(
            status_code=(
                status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail=(
                "Health service is not configured"
            ),
        ) from exc

    raise HTTPException(
        status_code=(
            status.HTTP_502_BAD_GATEWAY
        ),
        detail=(
            "Health service is unavailable"
        ),
    ) from exc


@router.get(
    "/weights",
    response_model=list[WeightEntry],
    response_model_exclude_none=True,
)
async def list_weights(
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> list[WeightEntry]:
    try:
        return await list_user_weight_entries(
            user
        )
    except (
        httpx.HTTPError,
        RuntimeError,
    ) as exc:
        _raise_health_http_error(exc)



@router.get(
    "/weight-summary",
    response_model=WeightTrendSummary,
    response_model_exclude_none=True,
)
async def get_weight_summary(
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> WeightTrendSummary:
    try:
        entries = (
            await list_user_weight_entries(
                user
            )
        )
        return build_weight_trend(
            entries
        )
    except (
        httpx.HTTPError,
        RuntimeError,
    ) as exc:
        _raise_health_http_error(exc)


@router.put(
    "/weights/{measurement_date}",
    response_model=WeightEntry,
    response_model_exclude_none=True,
)
async def save_weight(
    measurement_date: date,
    request: WeightEntryInput,
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> WeightEntry:
    try:
        return await save_user_weight_entry(
            user,
            measurement_date,
            request,
        )
    except (
        httpx.HTTPError,
        RuntimeError,
    ) as exc:
        _raise_health_http_error(exc)


@router.delete(
    "/weights/{measurement_date}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_weight(
    measurement_date: date,
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> Response:
    try:
        deleted = (
            await delete_user_weight_entry(
                user,
                measurement_date,
            )
        )
    except (
        httpx.HTTPError,
        RuntimeError,
    ) as exc:
        _raise_health_http_error(exc)

    if not deleted:
        raise HTTPException(
            status_code=(
                status.HTTP_404_NOT_FOUND
            ),
            detail=(
                "Weight entry not found"
            ),
        )

    return Response(
        status_code=(
            status.HTTP_204_NO_CONTENT
        )
    )


@router.get(
    "/body-measurements",
    response_model=list[BodyMeasurement],
    response_model_exclude_none=True,
)
async def list_body_measurements(
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> list[BodyMeasurement]:
    try:
        return await list_user_body_measurements(
            user
        )
    except (
        httpx.HTTPError,
        RuntimeError,
    ) as exc:
        _raise_health_http_error(exc)


@router.put(
    "/body-measurements/{measurement_date}",
    response_model=BodyMeasurement,
    response_model_exclude_none=True,
)
async def save_body_measurement(
    measurement_date: date,
    request: BodyMeasurementInput,
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> BodyMeasurement:
    try:
        return await save_user_body_measurement(
            user,
            measurement_date,
            request,
        )
    except (
        httpx.HTTPError,
        RuntimeError,
    ) as exc:
        _raise_health_http_error(exc)


@router.get(
    "/daily-checkins",
    response_model=list[DailyCheckIn],
    response_model_exclude_none=True,
)
async def list_daily_health_checkins(
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> list[DailyCheckIn]:
    try:
        return await list_user_daily_checkins(
            user
        )
    except (
        httpx.HTTPError,
        RuntimeError,
    ) as exc:
        _raise_health_http_error(exc)


@router.put(
    "/daily-checkins/{measurement_date}",
    response_model=DailyCheckIn,
    response_model_exclude_none=True,
)
async def save_daily_health_checkin(
    measurement_date: date,
    request: DailyCheckInInput,
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> DailyCheckIn:
    try:
        return await save_user_daily_checkin(
            user,
            measurement_date,
            request,
        )
    except (
        httpx.HTTPError,
        RuntimeError,
    ) as exc:
        _raise_health_http_error(exc)


@router.get(
    "/checkins",
    response_model=list[WeeklyCheckIn],
    response_model_exclude_none=True,
)
async def list_checkins(
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> list[WeeklyCheckIn]:
    try:
        return await list_user_weekly_checkins(
            user
        )
    except (
        httpx.HTTPError,
        RuntimeError,
    ) as exc:
        _raise_health_http_error(exc)


@router.put(
    "/checkins/{week_start}",
    response_model=WeeklyCheckIn,
    response_model_exclude_none=True,
)
async def save_checkin(
    week_start: date,
    request: WeeklyCheckInInput,
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> WeeklyCheckIn:

    if week_start.isoweekday() != 1:
        raise HTTPException(
            status_code=(
                status.HTTP_422_UNPROCESSABLE_ENTITY
            ),
            detail=(
                "week_start must be a Monday"
            ),
        )

    try:
        return await save_user_weekly_checkin(
            user,
            week_start,
            request,
        )
    except (
        httpx.HTTPError,
        RuntimeError,
    ) as exc:
        _raise_health_http_error(exc)
