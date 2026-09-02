import httpx
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)

from app.core.auth import (
    AuthenticatedUser,
    require_user,
)
from app.domains.trainer.models import TrainerAthlete
from app.domains.trainer.repository import (
    SupabaseConfigError,
)
from app.domains.trainer.service import (
    list_authenticated_trainer_athletes,
)


router = APIRouter(
    prefix="/trainer",
    tags=["Trainer"],
)


def require_trainer(
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> AuthenticatedUser:
    # Admin access is intentionally not included here:
    # the project has no generic admin-as-trainer pattern.
    if user.role != "trainer":
        raise HTTPException(
            status_code=(
                status.HTTP_403_FORBIDDEN
            ),
            detail="Trainer access required",
        )

    return user


@router.get(
    "/athletes",
    response_model=list[TrainerAthlete],
)
async def list_trainer_athletes(
    trainer: AuthenticatedUser = Depends(
        require_trainer
    ),
) -> list[TrainerAthlete]:
    try:
        return await list_authenticated_trainer_athletes(
            trainer
        )
    except SupabaseConfigError as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail="Supabase is not configured.",
        ) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_502_BAD_GATEWAY
            ),
            detail=(
                "Could not load trainer athletes"
            ),
        ) from exc
