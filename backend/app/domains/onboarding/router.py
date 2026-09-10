import httpx

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)

from pydantic import BaseModel, ConfigDict, Field
from uuid import UUID

from app.core.auth import (
    AuthenticatedUser,
    require_user,
)

from app.core.http_client import (
    get_supabase_http_client,
)

from app.domains.routines.models import Routine
from app.domains.routines.profile_models import (
    ExperienceLevel,
    Motivation,
    PrimaryGoal,
    Sex,
    TrainingLocation,
)
from app.domains.goals.models import Goal
from app.domains.goals import service as goal_service

from app.domains.exercises.custom_repository import (
    SupabaseConfigError,
    _supabase_config,
)


router = APIRouter(
    tags=["Onboarding"]
)


class OnboardingProfileInput(BaseModel):
    """Short V2 profile plus optional legacy compatibility fields."""

    model_config = ConfigDict(extra="ignore")

    display_name: str | None = Field(
        default=None,
        min_length=1,
        max_length=50,
    )
    experience_level: ExperienceLevel | None = None
    weekly_availability: int | None = Field(
        default=None,
        ge=2,
        le=6,
    )
    session_duration_min: int | None = Field(
        default=None,
        ge=25,
        le=180,
    )
    injuries: list[str] = Field(
        default_factory=list,
        max_length=10,
    )
    pain_areas: list[str] = Field(
        default_factory=list,
        max_length=10,
    )

    # Accepted during the transition for older clients. V2 does not ask for
    # these fields and never trusts primary_goal as its Goal source.
    age: int | None = Field(default=None, ge=14, le=100)
    sex: Sex | None = None
    height_cm: int | None = Field(default=None, ge=120, le=230)
    weight_kg: float | None = Field(default=None, ge=30, le=300)
    motivations: list[Motivation] = Field(
        default_factory=list,
        max_length=2,
    )
    primary_goal: PrimaryGoal | None = None
    training_location: TrainingLocation | None = None
    available_equipment: list[str] = Field(default_factory=list)
    avoided_exercise_ids: list[str] = Field(default_factory=list)
    preferred_exercise_ids: list[str] = Field(default_factory=list)


class OnboardingCompleteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    goal_id: UUID | None = None
    profile: OnboardingProfileInput = Field(
        default_factory=OnboardingProfileInput
    )


class OnboardingCompleteResponse(
    BaseModel
):
    onboarding_completed: bool
    routine: Routine | None = None


async def _persist_onboarding_profile(
    user: AuthenticatedUser,
    profile: OnboardingProfileInput,
    goal: Goal,
) -> None:
    if not user.access_token:
        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
            ),
            detail="Missing access token",
        )

    try:
        url, key = (
            _supabase_config()
        )

    except SupabaseConfigError as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail=(
                "Onboarding service "
                "is not configured"
            ),
        ) from exc

    headers = {
        "Authorization":
            f"Bearer {user.access_token}",
        "apikey":
            key,
        "Content-Type":
            "application/json",
        "Prefer": (
            "resolution=merge-duplicates,"
            "return=minimal"
        ),
    }

    legacy_goal_by_kind: dict[str, PrimaryGoal] = {
        "muscle_gain": "muscle_gain",
        "strength_gain": "strength_gain",
        "return_to_training": "return_to_training",
        "general_health": "general_health",
        "fat_loss": "fat_loss",
    }
    profile_payload = profile.model_dump(
        mode="json",
        exclude_none=True,
        exclude_unset=True,
        exclude={"primary_goal"},
    )
    legacy_goal = legacy_goal_by_kind.get(goal.kind)
    if legacy_goal is not None:
        profile_payload["primary_goal"] = legacy_goal

    payload = {
        **profile_payload,
        "user_id": user.id,
        "onboarding_completed": True,
    }

    try:
        client = get_supabase_http_client()
        response = await client.post(
            (
                f"{url}/rest/v1/"
                "training_profiles"
            ),
            headers=headers,
            params={
                "on_conflict": "user_id",
            },
            json=payload,
        )

    except (
        httpx.HTTPError,
        RuntimeError,
        SupabaseConfigError,
    ) as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail=(
                "Onboarding service "
                "is unavailable"
            ),
        ) from exc

    if response.status_code not in {
        200,
        201,
        204,
    }:
        raise HTTPException(
            status_code=(
                status.HTTP_502_BAD_GATEWAY
            ),
            detail=(
                "Could not complete "
                "Aptus onboarding"
            ),
        )


@router.post(
    "/onboarding/complete",
    response_model=(
        OnboardingCompleteResponse
    ),
)
async def complete_onboarding(
    request:
        OnboardingCompleteRequest,

    user:
        AuthenticatedUser = Depends(
            require_user
        ),
) -> OnboardingCompleteResponse:
    if user.role not in {"user", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Onboarding is not available for this role",
        )

    try:
        goal = await goal_service.get_user_active_goal(user)
    except (
        httpx.HTTPError,
        RuntimeError,
        SupabaseConfigError,
    ) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Goal service is unavailable",
        ) from exc

    if goal is None or (
        request.goal_id is not None
        and goal.id != request.goal_id
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An active Goal is required",
        )

    await _persist_onboarding_profile(
        user,
        request.profile,
        goal,
    )

    return OnboardingCompleteResponse(
        onboarding_completed=True,
        routine=None,
    )
