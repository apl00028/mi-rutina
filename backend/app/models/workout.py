from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


WorkoutStatus = Literal["in_progress", "finished"]


class WorkoutSet(BaseModel):
    model_config = ConfigDict(extra="allow")

    setId: str = Field(min_length=1)
    exerciseId: str = Field(min_length=1)
    setIndex: int = Field(ge=0)

    weight: float | None = Field(default=None, ge=0)
    reps: int | None = Field(default=None, ge=0)
    rir: float | None = Field(default=None, ge=0)
    durationSeconds: int | None = Field(default=None, ge=0)

    completedAt: str | None = None


class Workout(BaseModel):
    model_config = ConfigDict(extra="allow")

    workoutId: str = Field(min_length=1)
    routineId: str = Field(min_length=1)
    sessionId: str = Field(min_length=1)

    status: WorkoutStatus = "in_progress"

    startedAt: str | None = None
    finishedAt: str | None = None

    sets: list[WorkoutSet] = Field(default_factory=list)