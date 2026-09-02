from app.core.auth import AuthenticatedUser
from app.domains.trainer.models import TrainerAthlete
from app.domains.trainer.repository import (
    list_active_trainer_athletes,
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
