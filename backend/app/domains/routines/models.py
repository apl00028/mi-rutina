from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Routine(BaseModel):
    model_config = ConfigDict(extra="allow")

    routineId: str = Field(min_length=1)
    schemaVersion: str = Field(min_length=1)
    revision: int = Field(ge=0)
    sessions: list[dict[str, Any]] = Field(default_factory=list)
    createdAt: str | None = None
    updatedAt: str | None = None

    @model_validator(mode="after")
    def validate_canonical_shape(self) -> "Routine":
        for index, session in enumerate(self.sessions):
            session_id = session.get("sessionId")
            if not isinstance(session_id, str) or not session_id.strip():
                raise ValueError(f"sessions[{index}].sessionId is required")

            exercises = session.get("exercises")
            if exercises is not None and not isinstance(exercises, list):
                raise ValueError(f"sessions[{index}].exercises must be a list")

        return self
