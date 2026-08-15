import json
from pathlib import Path

from app.models.exercise import Exercise

DATA_FILE = Path(__file__).resolve().parents[1] / "data" / "exercises.json"


class ExerciseRepository:
    def list_all(self) -> list[Exercise]:
        with DATA_FILE.open("r", encoding="utf-8") as handle:
            data = json.load(handle)

        if not isinstance(data, list):
            raise RuntimeError("Exercise catalog must be a list.")

        return [Exercise.model_validate(item) for item in data]

    def get_by_id(self, exercise_id: str) -> Exercise | None:
        for exercise in self.list_all():
            if exercise.id == exercise_id:
                return exercise

        return None
