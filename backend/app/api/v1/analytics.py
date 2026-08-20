import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from auth import AuthenticatedUser, require_user
from app.models.training_analytics import (
    TrainingAnalyticsPeriod,
    TrainingAnalyticsResponse,
)
from app.repositories.custom_exercises import (
    SupabaseConfigError,
)
from app.services.training_analytics import (
    get_training_analytics,
)


router = APIRouter()


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
