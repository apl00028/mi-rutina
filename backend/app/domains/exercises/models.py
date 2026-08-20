from pydantic import BaseModel, ConfigDict, Field


class Exercise(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    muscle: str = Field(min_length=1)
    equipment: str = Field(min_length=1)
    type: str = Field(min_length=1)
    favorite: bool
    custom: bool
    notes: str
    category: str = Field(min_length=1)
    recordTypes: list[str] | None = None
