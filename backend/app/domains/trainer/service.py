from typing import Any

from app.core.auth import AuthenticatedUser
from app.domains.routines.models import Routine
from app.domains.trainer.models import (
    RoutineTemplate,
    RoutineTemplateCreate,
    RoutineTemplateUpdate,
    TrainerAthlete,
)
from app.domains.trainer.repository import (
    create_routine_template,
    delete_routine_template,
    get_routine_template_by_id,
    list_active_trainer_athletes,
    list_routine_templates,
    replace_routine_template,
)


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
