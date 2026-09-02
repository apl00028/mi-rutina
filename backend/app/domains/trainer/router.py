import httpx
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from pydantic import ValidationError

from app.core.auth import (
    AuthenticatedUser,
    require_user,
)
from app.domains.trainer.models import (
    RoutineDiscipline,
    RoutineTemplate,
    RoutineTemplateCreate,
    RoutineTemplateUpdate,
    TemplateAssignment,
    TemplateAssignmentCreate,
    TrainerAthlete,
)
from app.domains.trainer.repository import (
    SupabaseConfigError,
)
from app.domains.trainer.service import (
    TrainerAthleteRelationshipNotFound,
    TrainerTemplateNotFound,
    assign_authenticated_trainer_template,
    create_authenticated_trainer_template,
    delete_authenticated_trainer_template,
    get_authenticated_trainer_template,
    list_authenticated_trainer_athletes,
    list_authenticated_trainer_templates,
    replace_authenticated_trainer_template,
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


@router.get(
    "/templates",
    response_model=list[RoutineTemplate],
)
async def list_trainer_templates(
    discipline: RoutineDiscipline | None = None,
    trainer: AuthenticatedUser = Depends(
        require_trainer
    ),
) -> list[RoutineTemplate]:
    try:
        return await list_authenticated_trainer_templates(
            trainer,
            discipline,
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
                "Could not load trainer templates"
            ),
        ) from exc


@router.get(
    "/templates/{template_id}",
    response_model=RoutineTemplate,
)
async def get_trainer_template(
    template_id: str,
    trainer: AuthenticatedUser = Depends(
        require_trainer
    ),
) -> RoutineTemplate:
    try:
        template = await get_authenticated_trainer_template(
            trainer,
            template_id,
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
                "Could not load trainer template"
            ),
        ) from exc

    if template is None:
        raise HTTPException(
            status_code=(
                status.HTTP_404_NOT_FOUND
            ),
            detail="Trainer template not found",
        )

    return template


@router.post(
    "/templates",
    response_model=RoutineTemplate,
    status_code=status.HTTP_201_CREATED,
)
async def create_trainer_template(
    request: RoutineTemplateCreate,
    trainer: AuthenticatedUser = Depends(
        require_trainer
    ),
) -> RoutineTemplate:
    try:
        return await create_authenticated_trainer_template(
            trainer,
            request,
        )
    except (
        ValueError,
        ValidationError,
    ) as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_422_UNPROCESSABLE_ENTITY
            ),
            detail=str(exc),
        ) from exc
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
                "Could not create trainer template"
            ),
        ) from exc


@router.put(
    "/templates/{template_id}",
    response_model=RoutineTemplate,
)
async def replace_trainer_template(
    template_id: str,
    request: RoutineTemplateUpdate,
    trainer: AuthenticatedUser = Depends(
        require_trainer
    ),
) -> RoutineTemplate:
    try:
        template = await replace_authenticated_trainer_template(
            trainer,
            template_id,
            request,
        )
    except (
        ValueError,
        ValidationError,
    ) as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_422_UNPROCESSABLE_ENTITY
            ),
            detail=str(exc),
        ) from exc
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
                "Could not update trainer template"
            ),
        ) from exc

    if template is None:
        raise HTTPException(
            status_code=(
                status.HTTP_404_NOT_FOUND
            ),
            detail="Trainer template not found",
        )

    return template


@router.delete(
    "/templates/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_trainer_template(
    template_id: str,
    trainer: AuthenticatedUser = Depends(
        require_trainer
    ),
) -> None:
    try:
        deleted = await delete_authenticated_trainer_template(
            trainer,
            template_id,
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
                "Could not delete trainer template"
            ),
        ) from exc

    if not deleted:
        raise HTTPException(
            status_code=(
                status.HTTP_404_NOT_FOUND
            ),
            detail="Trainer template not found",
        )


@router.post(
    "/templates/{template_id}/assign",
    response_model=TemplateAssignment,
    status_code=status.HTTP_201_CREATED,
)
async def assign_trainer_template(
    template_id: str,
    request: TemplateAssignmentCreate,
    trainer: AuthenticatedUser = Depends(
        require_trainer
    ),
) -> TemplateAssignment:
    try:
        return await assign_authenticated_trainer_template(
            trainer,
            template_id,
            request,
        )
    except TrainerTemplateNotFound as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_404_NOT_FOUND
            ),
            detail="Trainer template not found",
        ) from exc
    except TrainerAthleteRelationshipNotFound as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_404_NOT_FOUND
            ),
            detail=(
                "Trainer athlete relationship not found"
            ),
        ) from exc
    except ValidationError as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_422_UNPROCESSABLE_ENTITY
            ),
            detail=str(exc),
        ) from exc
    except SupabaseConfigError as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail="Supabase is not configured.",
        ) from exc
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 409:
            raise HTTPException(
                status_code=(
                    status.HTTP_409_CONFLICT
                ),
                detail="Routine already exists",
            ) from exc

        raise HTTPException(
            status_code=(
                status.HTTP_502_BAD_GATEWAY
            ),
            detail=(
                "Could not assign trainer template"
            ),
        ) from exc
