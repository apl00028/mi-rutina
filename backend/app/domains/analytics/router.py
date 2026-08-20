import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import AuthenticatedUser, require_user
from app.domains.analytics.models import (
    TrainingAnalyticsPeriod,
    TrainingAnalyticsResponse,
)
from app.domains.exercises.custom_repository import (
    SupabaseConfigError,
)
from app.domains.analytics.service import (
    get_training_analytics,
)


router = APIRouter(
    tags=["Analytics"]
)


@router.get(
    "/analytics/training",
    response_model=TrainingAnalyticsResponse,
    response_model_exclude_none=True,
)
async def training_analytics(
    period: TrainingAnalyticsPeriod = "4w",
    user: AuthenticatedUser = Depends(require_user),
) -> TrainingAnalyticsResponse:
    try:
        return await get_training_analytics(
            user,
            period=period,
        )
    except (httpx.HTTPError, RuntimeError) as exc:
        if isinstance(exc, SupabaseConfigError):
            raise HTTPException(
                status_code=(
                    status.HTTP_503_SERVICE_UNAVAILABLE
                ),
                detail=(
                    "Training analytics service "
                    "is not configured"
                ),
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "Training analytics service "
                "is unavailable"
            ),
        ) from exc
