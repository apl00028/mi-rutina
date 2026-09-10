import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.auth import AuthenticatedUser, require_user
from app.core.http_client import get_supabase_http_client
from app.domains.exercises.custom_repository import (
    SupabaseConfigError,
    _supabase_config,
)
from app.domains.routines.profile_models import ExperienceLevel


router = APIRouter(
    prefix="/athlete-profile",
    tags=["Athlete profile"],
)

PROFILE_COLUMNS = (
    "user_id,experience_level,weekly_availability,"
    "session_duration_min,injuries,pain_areas"
)


class AthleteProfile(BaseModel):
    model_config = ConfigDict(extra="ignore")

    user_id: str
    experience_level: ExperienceLevel | None = None
    weekly_availability: int | None = Field(default=None, ge=2, le=6)
    session_duration_min: int | None = Field(default=None, ge=25, le=180)
    injuries: list[str] = Field(default_factory=list, max_length=10)
    pain_areas: list[str] = Field(default_factory=list, max_length=10)


class AthleteProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    experience_level: ExperienceLevel | None = None
    weekly_availability: int | None = Field(default=None, ge=2, le=6)
    session_duration_min: int | None = Field(default=None, ge=25, le=180)
    injuries: list[str] = Field(default_factory=list, max_length=10)
    pain_areas: list[str] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def require_change(self) -> "AthleteProfileUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one profile field is required")
        return self


async def require_athlete_owner(
    user: AuthenticatedUser = Depends(require_user),
) -> AuthenticatedUser:
    if user.role not in {"user", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Athlete profile operation is not authorized",
        )
    return user


def _headers(user: AuthenticatedUser) -> dict[str, str]:
    if not user.access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing access token",
        )
    _, key = _supabase_config()
    return {
        "Authorization": f"Bearer {user.access_token}",
        "apikey": key,
        "Content-Type": "application/json",
    }


def _service_error(exc: Exception) -> HTTPException:
    detail = (
        "Athlete profile service is not configured"
        if isinstance(exc, SupabaseConfigError)
        else "Athlete profile service is unavailable"
    )
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=detail,
    )


async def _read_profile(user: AuthenticatedUser) -> AthleteProfile | None:
    try:
        url, _ = _supabase_config()
        response = await get_supabase_http_client().get(
            f"{url}/rest/v1/training_profiles",
            headers=_headers(user),
            params={
                "user_id": f"eq.{user.id}",
                "select": PROFILE_COLUMNS,
                "limit": "1",
            },
        )
        response.raise_for_status()
    except (httpx.HTTPError, RuntimeError, SupabaseConfigError) as exc:
        raise _service_error(exc) from exc

    rows = response.json()
    return AthleteProfile.model_validate(rows[0]) if rows else None


@router.get("", response_model=AthleteProfile | None)
async def get_athlete_profile(
    user: AuthenticatedUser = Depends(require_athlete_owner),
) -> AthleteProfile | None:
    return await _read_profile(user)


@router.patch("", response_model=AthleteProfile)
async def update_athlete_profile(
    request: AthleteProfileUpdate,
    user: AuthenticatedUser = Depends(require_athlete_owner),
) -> AthleteProfile:
    payload = request.model_dump(
        mode="json",
        exclude_unset=True,
    )
    try:
        url, _ = _supabase_config()
        headers = _headers(user)
        headers["Prefer"] = "return=representation"
        response = await get_supabase_http_client().patch(
            f"{url}/rest/v1/training_profiles",
            headers=headers,
            params={
                "user_id": f"eq.{user.id}",
                "select": PROFILE_COLUMNS,
            },
            json=payload,
        )
        response.raise_for_status()
    except (httpx.HTTPError, RuntimeError, SupabaseConfigError) as exc:
        raise _service_error(exc) from exc

    rows = response.json()
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Athlete profile not found",
        )
    return AthleteProfile.model_validate(rows[0])
