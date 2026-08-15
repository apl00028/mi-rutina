import json
from pathlib import Path

from app.models.exercise import Exercise

DATA_FILE = Path(__file__).resolve().parents[1] / "data" / "exercises.json"


def load_exercises() -> list[Exercise]:
    with DATA_FILE.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    if not isinstance(data, list):
        raise RuntimeError("Exercise catalog must be a list.")

    return [Exercise.model_validate(item) for item in data]


def get_exercise_by_id(exercise_id: str) -> Exercise | None:
    for exercise in load_exercises():
        if exercise.id == exercise_id:
            return exercise

    return None
