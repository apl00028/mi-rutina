from fastapi import APIRouter, HTTPException

from app.models.exercise import Exercise
from app.services.exercises import get_exercise_by_id, load_exercises

router = APIRouter()


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
    exercise = get_exercise_by_id(exercise_id)

    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found")

    return exercise
