import httpx
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from uuid import UUID

from app.core.auth import (
    AuthenticatedUser,
    require_user,
)
from app.domains.exercises.custom_repository import (
    SupabaseConfigError,
)
from app.domains.goals.models import (
    Goal,
    GoalCreate,
    GoalMetric,
    GoalMetricBaseline,
    GoalMetricBaselinePut,
    GoalMetricCreate,
    GoalMetricState,
    GoalMetricTargetUpdate,
    GoalStatusUpdate,
    GoalUpdate,
    InvalidGoalTaxonomy,
)
from app.domains.goals.metric_registry import (
    InvalidGoalMetric,
)
from app.domains.goals import service


router = APIRouter(
    prefix="/goals",
    tags=["Goals"],
)


async def require_goal_owner(
    user: AuthenticatedUser = Depends(
        require_user
    ),
) -> AuthenticatedUser:
    if user.role not in {"user", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Goal operation is not authorized",
        )
    return user


def _raise_goal_error(exc: Exception) -> None:
    if isinstance(
        exc,
        (InvalidGoalTaxonomy, InvalidGoalMetric),
    ):
        raise HTTPException(
            status_code=(
                status.HTTP_422_UNPROCESSABLE_ENTITY
            ),
            detail=str(exc),
        ) from exc

    if isinstance(exc, service.GoalNotActiveError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    if (
        isinstance(exc, httpx.HTTPStatusError)
        and exc.response.status_code
        == status.HTTP_409_CONFLICT
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An active Goal already exists",
        ) from exc

    if isinstance(exc, SupabaseConfigError):
        raise HTTPException(
            status_code=(
                status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail="Goal service is not configured",
        ) from exc

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Goal service is unavailable",
    ) from exc


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Goal or metric not found",
    )


@router.get(
    "/active",
    response_model=Goal | None,
)
async def get_active_goal(
    user: AuthenticatedUser = Depends(
        require_goal_owner
    ),
) -> Goal | None:
    try:
        return await service.get_user_active_goal(user)
    except (
        httpx.HTTPError,
        RuntimeError,
        SupabaseConfigError,
    ) as exc:
        _raise_goal_error(exc)


@router.get("", response_model=list[Goal])
async def list_goals(
    user: AuthenticatedUser = Depends(
        require_goal_owner
    ),
) -> list[Goal]:
    try:
        return await service.list_user_goals(user)
    except (
        httpx.HTTPError,
        RuntimeError,
        SupabaseConfigError,
    ) as exc:
        _raise_goal_error(exc)


@router.post(
    "",
    response_model=Goal,
    status_code=status.HTTP_201_CREATED,
)
async def create_goal(
    request: GoalCreate,
    user: AuthenticatedUser = Depends(
        require_goal_owner
    ),
) -> Goal:
    try:
        return await service.create_user_goal(
            user,
            request,
        )
    except (
        httpx.HTTPError,
        RuntimeError,
        SupabaseConfigError,
    ) as exc:
        _raise_goal_error(exc)


@router.patch(
    "/{goal_id}",
    response_model=Goal,
)
async def update_goal(
    goal_id: UUID,
    request: GoalUpdate,
    user: AuthenticatedUser = Depends(
        require_goal_owner
    ),
) -> Goal:
    try:
        goal = await service.update_user_goal(
            user,
            str(goal_id),
            request,
        )
    except (
        httpx.HTTPError,
        RuntimeError,
        SupabaseConfigError,
        InvalidGoalTaxonomy,
    ) as exc:
        _raise_goal_error(exc)

    if goal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found",
        )
    return goal


@router.patch(
    "/{goal_id}/status",
    response_model=Goal,
)
async def change_goal_status(
    goal_id: UUID,
    request: GoalStatusUpdate,
    user: AuthenticatedUser = Depends(
        require_goal_owner
    ),
) -> Goal:
    try:
        goal = await service.close_user_goal(
            user,
            str(goal_id),
            request,
        )
    except (
        httpx.HTTPError,
        RuntimeError,
        SupabaseConfigError,
        service.GoalNotActiveError,
    ) as exc:
        _raise_goal_error(exc)

    if goal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found",
        )
    return goal


@router.get(
    "/{goal_id}/metrics",
    response_model=list[GoalMetric],
)
async def list_goal_metrics(
    goal_id: UUID,
    user: AuthenticatedUser = Depends(
        require_goal_owner
    ),
) -> list[GoalMetric]:
    try:
        metrics = await service.list_user_goal_metrics(
            user,
            str(goal_id),
        )
    except (
        httpx.HTTPError,
        RuntimeError,
        SupabaseConfigError,
    ) as exc:
        _raise_goal_error(exc)
    if metrics is None:
        raise _not_found()
    return metrics


@router.post(
    "/{goal_id}/metrics",
    response_model=GoalMetric,
    status_code=status.HTTP_201_CREATED,
)
async def create_goal_metric(
    goal_id: UUID,
    request: GoalMetricCreate,
    user: AuthenticatedUser = Depends(
        require_goal_owner
    ),
) -> GoalMetric:
    try:
        metric = await service.create_user_goal_metric(
            user,
            str(goal_id),
            request,
        )
    except (
        httpx.HTTPError,
        RuntimeError,
        SupabaseConfigError,
        InvalidGoalMetric,
    ) as exc:
        if (
            isinstance(exc, httpx.HTTPStatusError)
            and exc.response.status_code
            == status.HTTP_409_CONFLICT
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Metric already exists for this Goal",
            ) from exc
        _raise_goal_error(exc)
    if metric is None:
        raise _not_found()
    return metric


@router.patch(
    "/{goal_id}/metrics/{metric_id}/target",
    response_model=GoalMetric,
)
async def update_goal_metric_target(
    goal_id: UUID,
    metric_id: UUID,
    request: GoalMetricTargetUpdate,
    user: AuthenticatedUser = Depends(
        require_goal_owner
    ),
) -> GoalMetric:
    try:
        metric = (
            await service.update_user_goal_metric_target(
                user,
                str(goal_id),
                str(metric_id),
                request,
            )
        )
    except (
        httpx.HTTPError,
        RuntimeError,
        SupabaseConfigError,
        InvalidGoalMetric,
    ) as exc:
        _raise_goal_error(exc)
    if metric is None:
        raise _not_found()
    return metric


@router.put(
    "/{goal_id}/metrics/{metric_id}/baseline",
    response_model=GoalMetricBaseline,
)
async def put_goal_metric_baseline(
    goal_id: UUID,
    metric_id: UUID,
    request: GoalMetricBaselinePut,
    user: AuthenticatedUser = Depends(
        require_goal_owner
    ),
) -> GoalMetricBaseline:
    try:
        baseline = (
            await service.put_user_goal_metric_baseline(
                user,
                str(goal_id),
                str(metric_id),
                request,
            )
        )
    except (
        httpx.HTTPError,
        RuntimeError,
        SupabaseConfigError,
        InvalidGoalMetric,
    ) as exc:
        _raise_goal_error(exc)
    if baseline is None:
        raise _not_found()
    return baseline


@router.get(
    "/{goal_id}/metric-states",
    response_model=list[GoalMetricState],
)
async def list_goal_metric_states(
    goal_id: UUID,
    user: AuthenticatedUser = Depends(
        require_goal_owner
    ),
) -> list[GoalMetricState]:
    try:
        states = await service.list_user_goal_metric_states(
            user,
            str(goal_id),
        )
    except (
        httpx.HTTPError,
        RuntimeError,
        SupabaseConfigError,
    ) as exc:
        _raise_goal_error(exc)
    if states is None:
        raise _not_found()
    return states
