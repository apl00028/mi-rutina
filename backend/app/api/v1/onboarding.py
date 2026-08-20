import re
import uuid
from datetime import (
    datetime,
    timezone,
)

import httpx

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)

from pydantic import BaseModel

from auth import (
    AuthenticatedUser,
    require_user,
)

from app.models.routine import Routine

from app.models.training_profile import (
    TrainingProfileInput,
)

from app.repositories.custom_exercises import (
    SupabaseConfigError,
    _supabase_config,
)

from app.services.routine_generator import (
    generate_routine,
)


router = APIRouter()


class OnboardingCompleteRequest(
    BaseModel
):
    profile: TrainingProfileInput


class OnboardingCompleteResponse(
    BaseModel
):
    onboarding_completed: bool
    routine: Routine


def _number_range(
    value: str | None,
) -> tuple[int, int]:

    if not value:
        return (
            1,
            1,
        )

    numbers = [
        int(item)
        for item in re.findall(
            r"\d+",
            value,
        )
    ]

    if not numbers:
        return (
            1,
            1,
        )

    if len(numbers) == 1:
        return (
            numbers[0],
            numbers[0],
        )

    return (
        numbers[0],
        numbers[1],
    )


def _rir_range(
    value: str | None,
) -> dict | None:

    if not value:
        return None

    minimum, maximum = (
        _number_range(value)
    )

    return {
        "min": minimum,
        "max": maximum,
    }


def _canonical_routine(
    profile: TrainingProfileInput,
) -> Routine:

    generated = generate_routine(
        profile
    )

    now = datetime.now(
        timezone.utc
    ).isoformat()

    routine_id = (
        "routine-onboarding-"
        f"{uuid.uuid4()}"
    )

    sessions: list[dict] = []

    for (
        session_index,
        session,
    ) in enumerate(
        generated.sessions
    ):

        exercises: list[dict] = []

        for (
            exercise_index,
            exercise,
        ) in enumerate(
            session.exercises
        ):

            target_min, target_max = (
                _number_range(
                    exercise.target
                )
            )

            target_type = (
                "duration"
                if exercise.record_type
                == "duration"
                else "repetitions"
            )

            target_rir = (
                _rir_range(
                    exercise.target_rir
                )
            )

            prescription = {
                "sets":
                    exercise.sets,

                "target": {
                    "min":
                        target_min,

                    "max":
                        target_max,

                    "type":
                        target_type,
                },

                "recordType":
                    exercise.record_type,

                "restSeconds":
                    exercise.rest_seconds,
            }

            if target_rir is not None:
                prescription[
                    "targetRir"
                ] = target_rir


            exercise_payload = {
                "exerciseId":
                    exercise.exercise_id,

                "id":
                    exercise.exercise_id,

                "name":
                    exercise.name,

                "order":
                    exercise_index + 1,

                "role":
                    exercise.role,

                "movementPattern":
                    exercise.movement_pattern,

                "sets":
                    exercise.sets,

                "target":
                    exercise.target,

                "recordType":
                    exercise.record_type,

                "restSeconds":
                    exercise.rest_seconds,

                "weight":
                    None,

                "prescription":
                    prescription,
            }

            if target_rir is not None:
                exercise_payload[
                    "targetRir"
                ] = target_rir

            exercises.append(
                exercise_payload
            )


        sessions.append({
            "sessionId":
                session.session_id,

            "order":
                session_index + 1,

            "label":
                session.name,

            "name":
                session.name,

            "focus":
                session.focus,

            "estimatedDurationMinutes":
                profile
                .session_duration_min,

            "exercises":
                exercises,
        })


    return Routine(
        routineId=routine_id,
        schemaVersion="4.2",
        revision=1,

        name=(
            "Rutina inicial · "
            f"{generated.structure_label}"
        ),

        createdAt=now,
        updatedAt=now,

        structureId=(
            generated.structure_id
        ),

        rationale=(
            generated.rationale
        ),

        warnings=(
            generated.warnings
        ),

        sessions=sessions,
    )


def _ensure_usable_routine(
    routine: Routine,
) -> None:

    if not routine.sessions:
        raise HTTPException(
            status_code=(
                status.HTTP_422_UNPROCESSABLE_ENTITY
            ),
            detail=(
                "Could not generate "
                "a valid routine"
            ),
        )

    for index, session in enumerate(
        routine.sessions
    ):
        exercises = session.get(
            "exercises"
        )

        if (
            not isinstance(
                exercises,
                list,
            )
            or not exercises
        ):
            raise HTTPException(
                status_code=(
                    status.HTTP_422_UNPROCESSABLE_ENTITY
                ),
                detail=(
                    "Could not generate "
                    "a usable routine"
                ),
            )

        for exercise_index, exercise in enumerate(
            exercises
        ):
            if not isinstance(
                exercise,
                dict,
            ):
                raise HTTPException(
                    status_code=(
                        status
                        .HTTP_422_UNPROCESSABLE_ENTITY
                    ),
                    detail=(
                        "Could not generate "
                        "a usable routine"
                    ),
                )

            exercise_id = exercise.get(
                "exerciseId"
            )

            if (
                not isinstance(
                    exercise_id,
                    str,
                )
                or not exercise_id.strip()
            ):
                raise HTTPException(
                    status_code=(
                        status
                        .HTTP_422_UNPROCESSABLE_ENTITY
                    ),
                    detail=(
                        "Could not generate "
                        "a usable routine"
                    ),
                )

            legacy_id = exercise.get(
                "id"
            )

            if (
                legacy_id is not None
                and (
                    not isinstance(
                        legacy_id,
                        str,
                    )
                    or not legacy_id.strip()
                    or legacy_id.strip()
                    != exercise_id.strip()
                )
            ):
                raise HTTPException(
                    status_code=(
                        status
                        .HTTP_422_UNPROCESSABLE_ENTITY
                    ),
                    detail=(
                        "Could not generate "
                        "a usable routine"
                    ),
                )

            if (
                not isinstance(
                    exercise.get("name"),
                    str,
                )
                or not exercise["name"].strip()
            ):
                raise HTTPException(
                    status_code=(
                        status
                        .HTTP_422_UNPROCESSABLE_ENTITY
                    ),
                    detail=(
                        "Could not generate "
                        "a usable routine"
                    ),
                )

            sets = exercise.get("sets")
            rest_seconds = exercise.get(
                "restSeconds"
            )

            if (
                not isinstance(sets, int)
                or sets < 1
                or sets > 10
                or not isinstance(
                    rest_seconds,
                    int,
                )
                or rest_seconds < 0
                or rest_seconds > 600
            ):
                raise HTTPException(
                    status_code=(
                        status
                        .HTTP_422_UNPROCESSABLE_ENTITY
                    ),
                    detail=(
                        "Could not generate "
                        "a usable routine"
                    ),
                )

            target = exercise.get("target")

            if (
                not isinstance(target, str)
                or not target.strip()
            ):
                raise HTTPException(
                    status_code=(
                        status
                        .HTTP_422_UNPROCESSABLE_ENTITY
                    ),
                    detail=(
                        "Could not generate "
                        "a usable routine"
                    ),
                )


async def _persist_onboarding(
    user: AuthenticatedUser,
    profile: TrainingProfileInput,
    routine: Routine,
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
    }


    payload = {
        "p_profile":
            profile.model_dump(),

        "p_routine":
            routine.model_dump(
                exclude_none=True
            ),
    }


    try:
        async with httpx.AsyncClient(
            timeout=15.0
        ) as client:

            response = await client.post(
                (
                    f"{url}"
                    "/rest/v1/rpc/"
                    "complete_gymos_onboarding"
                ),
                headers=headers,
                json=payload,
            )

    except httpx.HTTPError as exc:
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
                "GymOS onboarding"
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

    routine = _canonical_routine(
        request.profile
    )

    _ensure_usable_routine(
        routine
    )


    await _persist_onboarding(
        user=user,
        profile=request.profile,
        routine=routine,
    )


    return OnboardingCompleteResponse(
        onboarding_completed=True,
        routine=routine,
    )
