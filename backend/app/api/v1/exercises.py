import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter()

DATA_FILE = Path(__file__).resolve().parents[2] / "data" / "exercises.json"


def load_exercises() -> list[dict]:
    with DATA_FILE.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    if not isinstance(data, list):
        raise RuntimeError("Exercise catalog must be a list.")

    return data


@router.get("/exercises")
def list_exercises() -> list[dict]:
    return load_exercises()


@router.get("/exercises/{exercise_id}")
def get_exercise(exercise_id: str) -> dict:
    for exercise in load_exercises():
        if exercise.get("id") == exercise_id:
            return exercise

    raise HTTPException(status_code=404, detail="Exercise not found")
