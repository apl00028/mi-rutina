from pydantic import BaseModel, Field


class CustomExerciseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    muscle: str = Field(min_length=1, max_length=80)
    equipment: str = Field(min_length=1, max_length=80)
    type: str = Field(min_length=1, max_length=80)
    notes: str = Field(default="", max_length=1000)
    category: str = Field(min_length=1, max_length=80)
    recordTypes: list[str] = Field(default_factory=list)
