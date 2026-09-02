from typing import Literal

from pydantic import BaseModel


class TrainerAthlete(BaseModel):
    athlete_id: str
    status: Literal[
        "active",
        "inactive",
    ]
