import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.models.exercise import Exercise

router = APIRouter()

DATA_FILE = Path(__file__).resolve().parents[2] / "data" / "exercises.json"


def load_exercises() -> list[Exercise]:
    with DATA_FILE.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    if not isinstance(data, list):
        raise RuntimeError("Exercise catalog must be a list.")

    return [Exercise.model_validate(item) for item in data]


@router.get(
    "/exercises",
    response_model=list[Exercise],
    response_model_exclude_none=True,
)
def list_exercises() -> list[Exercise]:
    return load_exercises()


@router.get(
    "/exercises/{exercise_id}",
    response_model=Exercise,
    response_model_exclude_none=True,
)
def get_exercise(exercise_id: str) -> Exercise:
    for exercise in load_exercises():
        if exercise.id == exercise_id:
            return exercise

    raise HTTPException(status_code=404, detail="Exercise not found")
