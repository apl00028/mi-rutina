from pydantic import BaseModel, Field

from app.domains.exercises.models import Exercise


class ExerciseResolveRequest(BaseModel):
    exerciseId: str | None = Field(default=None, max_length=120)
    exerciseName: str | None = Field(default=None, max_length=160)


class ExerciseCorrection(BaseModel):
    code: str = "exercise_name_normalized_from_id"
    severity: str = "correction"
    originalName: str
    canonicalName: str
    exerciseId: str
    message: str


class ExerciseResolveResponse(BaseModel):
    exercise: Exercise | None = None
    correction: ExerciseCorrection | None = None
    errorCode: str | None = None
    error: str | None = None
