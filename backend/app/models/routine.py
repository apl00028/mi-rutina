from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class Routine(BaseModel):
    model_config = ConfigDict(extra="allow")

    routineId: str = Field(min_length=1)
    schemaVersion: str = Field(min_length=1)
    revision: int = Field(ge=1)
    sessions: list[dict[str, Any]] = Field(default_factory=list)
    createdAt: str | None = None
    updatedAt: str | None = None
