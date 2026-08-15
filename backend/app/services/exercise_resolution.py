import unicodedata

from app.models.exercise_resolution import (
    ExerciseCorrection,
    ExerciseResolveResponse,
)
from app.repositories.exercises import ExerciseRepository


_repository = ExerciseRepository()


def normalize_token(value: str | None) -> str:
    text = (value or "").strip().lower()
    normalized = unicodedata.normalize("NFKD", text)
    return "".join(
        char
        for char in normalized
        if not unicodedata.combining(char)
    )


def resolve_exercise(
    exercise_id: str | None = None,
    exercise_name: str | None = None,
) -> ExerciseResolveResponse:
    exercise_id = (exercise_id or "").strip()
    exercise_name = (exercise_name or "").strip()

    exercises = _repository.list_all()

    if exercise_id:
        exercise = _repository.get_by_id(exercise_id)

        if exercise is None:
            return ExerciseResolveResponse(
                errorCode="unknown_exercise_id",
                error="El ID de ejercicio no existe en la biblioteca de GymOS.",
            )

        canonical_name = exercise.name

        if exercise_name == canonical_name:
            return ExerciseResolveResponse(exercise=exercise)

        message = (
            f'El nombre “{exercise_name}” se ha normalizado a '
            f'“{canonical_name}” usando el ID {exercise_id}.'
            if exercise_name
            else f'Se ha completado el nombre “{canonical_name}” usando el ID {exercise_id}.'
        )

        return ExerciseResolveResponse(
            exercise=exercise,
            correction=ExerciseCorrection(
                originalName=exercise_name,
                canonicalName=canonical_name,
                exerciseId=exercise_id,
                message=message,
            ),
        )

    normalized_name = normalize_token(exercise_name)

    matches = [
        exercise
        for exercise in exercises
        if normalize_token(exercise.name) == normalized_name
    ]

    distinct = {
        exercise.id: exercise
        for exercise in matches
    }

    if len(distinct) == 1:
        return ExerciseResolveResponse(
            exercise=next(iter(distinct.values()))
        )

    if len(distinct) > 1:
        return ExerciseResolveResponse(
            errorCode="ambiguous_exercise",
            error="El nombre coincide con varios ejercicios. Utiliza el ID exacto.",
        )

    return ExerciseResolveResponse(
        errorCode="unknown_exercise",
        error="No se reconoce el ejercicio. Utiliza un ID de la biblioteca o corrige el nombre.",
    )
