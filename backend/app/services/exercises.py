from app.models.exercise import Exercise
from app.repositories.exercises import DATA_FILE, ExerciseRepository

_repository = ExerciseRepository()


def load_exercises() -> list[Exercise]:
    return _repository.list_all()


def get_exercise_by_id(exercise_id: str) -> Exercise | None:
    return _repository.get_by_id(exercise_id)
