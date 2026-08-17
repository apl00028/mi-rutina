from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class CustomExerciseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    muscle: str = Field(min_length=1, max_length=80)
    equipment: str = Field(min_length=1, max_length=80)
    type: str = Field(min_length=1, max_length=80)
    notes: str = Field(default="", max_length=1000)
    category: str = Field(min_length=1, max_length=80)
    recordTypes: list[str] = Field(default_factory=list)


class CustomExerciseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=160)
    muscle: str | None = Field(default=None, min_length=1, max_length=80)
    equipment: str | None = Field(default=None, min_length=1, max_length=80)
    type: str | None = Field(default=None, min_length=1, max_length=80)
    notes: str | None = Field(default=None, max_length=1000)
    category: str | None = Field(default=None, min_length=1, max_length=80)
    recordTypes: list[str] | None = None

    @model_validator(mode="after")
    def validate_patch_fields(self) -> "CustomExerciseUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")

        null_fields = [
            field
            for field in self.model_fields_set
            if getattr(self, field) is None
        ]

        if null_fields:
            raise ValueError("Null values are not allowed")

        return self

    def update_payload(self) -> dict[str, Any]:
        return self.model_dump(include=self.model_fields_set)
