from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


WorkoutStatus = Literal["in_progress", "finished"]
WorkoutSetType = Literal["working", "warmup"]


class ExerciseDiscomfort(BaseModel):
    model_config = ConfigDict(extra="forbid")

    exerciseId: str = Field(min_length=1)
    painScore: int = Field(ge=0, le=10)
    area: str | None = None
    note: str | None = None


class WorkoutSet(BaseModel):
    model_config = ConfigDict(extra="allow")

    setId: str = Field(min_length=1)
    exerciseId: str = Field(min_length=1)
    setIndex: int
    setType: WorkoutSetType = "working"

    weight: float | None = Field(default=None, ge=0)
    reps: int | None = Field(default=None, ge=0)
    rir: float | None = Field(default=None, ge=0)
    durationSeconds: int | None = Field(default=None, ge=0)

    completedAt: str | None = None

    @model_validator(mode="after")
    def validate_set_index(self):
        if (
            self.setType == "working"
            and self.setIndex < 0
        ):
            raise ValueError(
                "Working sets require setIndex >= 0."
            )

        if (
            self.setType == "warmup"
            and self.setIndex >= 0
        ):
            raise ValueError(
                "Warmup sets require setIndex < 0."
            )

        return self


class Workout(BaseModel):
    model_config = ConfigDict(extra="allow")

    workoutId: str = Field(min_length=1)
    routineId: str = Field(min_length=1)
    sessionId: str = Field(min_length=1)

    status: WorkoutStatus = "in_progress"

    startedAt: str | None = None
    finishedAt: str | None = None

    sets: list[WorkoutSet] = Field(default_factory=list)

    discomforts: list[ExerciseDiscomfort] = Field(
        default_factory=list
    )