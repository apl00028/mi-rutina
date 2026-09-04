from typing import Any

from copy import deepcopy
from datetime import datetime, timezone

from app.core.auth import AuthenticatedUser
from app.domains.routines.models import Routine
from app.domains.trainer.models import (
    RoutineTemplate,
    RoutineTemplateCreate,
    RoutineTemplateUpdate,
    TemplateAssignment,
    TemplateAssignmentCreate,
    TrainerAthlete,
    TrainerAthleteOverview,
    TrainerPerformanceSession,
    TrainerStrengthSession,
    TrainerSwimmingSessionDetail,
)
from app.domains.trainer.repository import (
    assign_routine_template,
    create_routine_template,
    delete_routine_template,
    get_active_trainer_athlete,
    get_trainer_athlete_overview,
    get_trainer_athlete_swimming_session,
    get_routine_template_by_id,
    list_trainer_athlete_running_sessions,
    list_trainer_athlete_strength_sessions,
    list_trainer_athlete_swimming_sessions,
    list_active_trainer_athletes,
    list_routine_templates,
    replace_routine_template,
)


class TrainerTemplateNotFound(RuntimeError):
    pass


class TrainerAthleteRelationshipNotFound(RuntimeError):
    pass


async def list_authenticated_trainer_athletes(
    trainer: AuthenticatedUser,
) -> list[TrainerAthlete]:
    rows = await list_active_trainer_athletes(
        trainer
    )

    return [
        TrainerAthlete.model_validate(row)
        for row in rows
    ]


async def get_authenticated_trainer_athlete_overview(
    trainer: AuthenticatedUser,
    athlete_id: str,
) -> TrainerAthleteOverview | None:
    row = await get_trainer_athlete_overview(
        trainer,
        athlete_id,
    )

    if row is None:
        return None

    return TrainerAthleteOverview.model_validate(
        row
    )


async def list_authenticated_trainer_strength_sessions(
    trainer: AuthenticatedUser,
    athlete_id: str,
) -> list[TrainerStrengthSession]:
    rows = await list_trainer_athlete_strength_sessions(
        trainer,
        athlete_id,
    )

    return [
        TrainerStrengthSession.model_validate(row)
        for row in rows
    ]


async def list_authenticated_trainer_swimming_sessions(
    trainer: AuthenticatedUser,
    athlete_id: str,
) -> list[TrainerPerformanceSession]:
    rows = await list_trainer_athlete_swimming_sessions(
        trainer,
        athlete_id,
    )

    return [
        TrainerPerformanceSession.model_validate(row)
        for row in rows
    ]


async def get_authenticated_trainer_swimming_session(
    trainer: AuthenticatedUser,
    athlete_id: str,
    session_id: str,
) -> TrainerSwimmingSessionDetail | None:
    row = await get_trainer_athlete_swimming_session(
        trainer,
        athlete_id,
        session_id,
    )

    if row is None:
        return None

    return TrainerSwimmingSessionDetail.model_validate(
        row
    )


async def list_authenticated_trainer_running_sessions(
    trainer: AuthenticatedUser,
    athlete_id: str,
) -> list[TrainerPerformanceSession]:
    rows = await list_trainer_athlete_running_sessions(
        trainer,
        athlete_id,
    )

    return [
        TrainerPerformanceSession.model_validate(row)
        for row in rows
    ]


def _validate_template_data(
    *,
    template_id: str,
    discipline: str,
    data: dict[str, Any],
) -> dict[str, Any]:
    payload = dict(data)
    data_discipline = payload.get(
        "discipline"
    )

    if (
        data_discipline is not None
        and data_discipline != discipline
    ):
        raise ValueError(
            "Template discipline must match data discipline"
        )

    payload["routineId"] = template_id
    payload["discipline"] = discipline

    routine = Routine.model_validate(
        payload
    )

    return routine.model_dump(
        mode="json",
        exclude_none=True,
    )


def _row_to_template(
    row: dict[str, Any],
) -> RoutineTemplate:
    return RoutineTemplate.model_validate(
        row
    )


def _utc_now_iso() -> str:
    return datetime.now(
        timezone.utc
    ).isoformat().replace(
        "+00:00",
        "Z",
    )


async def list_authenticated_trainer_templates(
    trainer: AuthenticatedUser,
    discipline: str | None = None,
) -> list[RoutineTemplate]:
    rows = await list_routine_templates(
        trainer,
        discipline,
    )

    return [
        _row_to_template(row)
        for row in rows
    ]


async def get_authenticated_trainer_template(
    trainer: AuthenticatedUser,
    template_id: str,
) -> RoutineTemplate | None:
    row = await get_routine_template_by_id(
        trainer,
        template_id,
    )

    if row is None:
        return None

    return _row_to_template(row)


async def create_authenticated_trainer_template(
    trainer: AuthenticatedUser,
    request: RoutineTemplateCreate,
) -> RoutineTemplate:
    payload = request.model_dump(
        mode="json"
    )
    payload["data"] = _validate_template_data(
        template_id=request.id,
        discipline=request.discipline,
        data=request.data,
    )

    row = await create_routine_template(
        trainer,
        payload,
    )

    return _row_to_template(row)


async def replace_authenticated_trainer_template(
    trainer: AuthenticatedUser,
    template_id: str,
    request: RoutineTemplateUpdate,
) -> RoutineTemplate | None:
    payload = request.model_dump(
        mode="json"
    )
    payload["data"] = _validate_template_data(
        template_id=template_id,
        discipline=request.discipline,
        data=request.data,
    )

    row = await replace_routine_template(
        trainer,
        template_id,
        payload,
    )

    if row is None:
        return None

    return _row_to_template(row)


async def delete_authenticated_trainer_template(
    trainer: AuthenticatedUser,
    template_id: str,
) -> bool:
    return await delete_routine_template(
        trainer,
        template_id,
    )


def _build_assignment_snapshot(
    *,
    trainer: AuthenticatedUser,
    template: RoutineTemplate,
    routine_id: str,
    assigned_at: str,
) -> dict[str, Any]:
    payload = deepcopy(
        template.data
    )
    payload["routineId"] = routine_id
    payload["discipline"] = template.discipline
    payload["source"] = {
        "type":
            "trainer_template",
        "trainerId":
            trainer.id,
        "templateId":
            template.id,
        "assignedAt":
            assigned_at,
    }

    routine = Routine.model_validate(
        payload
    )

    return routine.model_dump(
        mode="json",
        exclude_none=True,
    )


async def assign_authenticated_trainer_template(
    trainer: AuthenticatedUser,
    template_id: str,
    request: TemplateAssignmentCreate,
) -> TemplateAssignment:
    template = await get_authenticated_trainer_template(
        trainer,
        template_id,
    )

    if template is None:
        raise TrainerTemplateNotFound(
            "Trainer template not found"
        )

    relationship = await get_active_trainer_athlete(
        trainer,
        request.athlete_id,
    )

    if relationship is None:
        raise TrainerAthleteRelationshipNotFound(
            "Trainer athlete relationship not found"
        )

    assigned_at = _utc_now_iso()
    _build_assignment_snapshot(
        trainer=trainer,
        template=template,
        routine_id=request.routine_id,
        assigned_at=assigned_at,
    )

    row = await assign_routine_template(
        trainer,
        athlete_id=request.athlete_id,
        template_id=template.id,
        routine_id=request.routine_id,
    )

    return TemplateAssignment.model_validate(
        row
    )
