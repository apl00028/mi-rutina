import asyncio

import pytest
from fastapi import HTTPException

from app.core.auth import AuthenticatedUser
from app.domains.exercises.models import Exercise
from app.domains.routines.models import Routine
from app.domains.workouts.models import Workout


def _user(user_id: str) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=user_id,
        email=f"{user_id}@example.com",
        access_token=f"token-{user_id}",
    )


def _routine_payload(routine_id: str) -> dict:
    return {
        "schemaVersion": "4.2",
        "routineId": routine_id,
        "revision": 1,
        "sessions": [
            {
                "sessionId": "session-a",
                "exercises": [],
            }
        ],
    }


def _workout_payload(workout_id: str) -> dict:
    return {
        "workoutId": workout_id,
        "routineId": "routine-a",
        "sessionId": "session-a",
        "status": "in_progress",
        "sets": [],
    }


def _custom_exercise(exercise_id: str) -> Exercise:
    return Exercise(
        id=exercise_id,
        name="Press privado",
        muscle="Pecho",
        equipment="Mancuernas",
        type="Fuerza",
        favorite=False,
        custom=True,
        notes="",
        category="strength",
        recordTypes=["weight", "reps"],
    )


def test_routine_ownership_blocks_cross_user_access(monkeypatch):
    from app.domains.routines import router as routines_api

    owners: dict[str, str] = {}

    async def create_user_routine(user, routine):
        owners[routine.routineId] = user.id
        return routine

    async def get_user_routine_by_id(user, routine_id):
        if owners.get(routine_id) != user.id:
            return None
        return Routine.model_validate(_routine_payload(routine_id))

    async def replace_user_routine(user, routine_id, routine):
        if owners.get(routine_id) != user.id:
            return None
        return routine

    async def delete_user_routine(user, routine_id):
        if owners.get(routine_id) != user.id:
            return False
        del owners[routine_id]
        return True

    async def activate_user_routine(user, routine_id):
        if owners.get(routine_id) != user.id:
            return None
        return Routine.model_validate(_routine_payload(routine_id))

    monkeypatch.setattr(
        routines_api,
        "create_user_routine",
        create_user_routine,
    )
    monkeypatch.setattr(
        routines_api,
        "get_user_routine_by_id",
        get_user_routine_by_id,
    )
    monkeypatch.setattr(
        routines_api,
        "replace_user_routine",
        replace_user_routine,
    )
    monkeypatch.setattr(
        routines_api,
        "delete_user_routine",
        delete_user_routine,
    )
    monkeypatch.setattr(
        routines_api,
        "activate_user_routine",
        activate_user_routine,
    )

    routine = Routine.model_validate(
        {
            **_routine_payload("routine-a"),
            "user_id": "user-b",
        }
    )

    created = asyncio.run(
        routines_api.create_routine(
            request=routine,
            user=_user("user-a"),
        )
    )
    assert created.routineId == "routine-a"
    assert owners == {"routine-a": "user-a"}

    own_read = asyncio.run(
        routines_api.get_routine("routine-a", _user("user-a"))
    )
    assert own_read.routineId == "routine-a"

    for action in (
        lambda: routines_api.get_routine(
            "routine-a",
            _user("user-b"),
        ),
        lambda: routines_api.replace_routine(
            "routine-a",
            Routine.model_validate(_routine_payload("routine-a")),
            _user("user-b"),
        ),
        lambda: routines_api.delete_routine(
            "routine-a",
            _user("user-b"),
        ),
        lambda: routines_api.activate_routine(
            "routine-a",
            _user("user-b"),
        ),
    ):
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(action())
        assert exc_info.value.status_code == 404

    assert owners == {"routine-a": "user-a"}


def test_workout_ownership_blocks_cross_user_access(monkeypatch):
    from app.domains.workouts import router as workouts_api

    owners: dict[str, str] = {}

    async def create_user_workout(user, workout):
        owners[workout.workoutId] = user.id
        return workout

    async def get_user_workout_by_id(user, workout_id):
        if owners.get(workout_id) != user.id:
            return None
        return Workout.model_validate(_workout_payload(workout_id))

    async def replace_user_workout(user, workout_id, workout):
        if owners.get(workout_id) != user.id:
            return None
        return workout

    async def delete_user_workout(user, workout_id):
        if owners.get(workout_id) != user.id:
            return False
        del owners[workout_id]
        return True

    monkeypatch.setattr(
        workouts_api,
        "create_user_workout",
        create_user_workout,
    )
    monkeypatch.setattr(
        workouts_api,
        "get_user_workout_by_id",
        get_user_workout_by_id,
    )
    monkeypatch.setattr(
        workouts_api,
        "replace_user_workout",
        replace_user_workout,
    )
    monkeypatch.setattr(
        workouts_api,
        "delete_user_workout",
        delete_user_workout,
    )

    created = asyncio.run(
        workouts_api.create_workout(
            request=Workout.model_validate(
                {
                    **_workout_payload("workout-a"),
                    "user_id": "user-b",
                }
            ),
            user=_user("user-a"),
        )
    )
    assert created.workoutId == "workout-a"
    assert owners == {"workout-a": "user-a"}

    foreign_actions = (
        lambda: workouts_api.get_workout(
            "workout-a",
            _user("user-b"),
        ),
        lambda: workouts_api.replace_workout(
            "workout-a",
            Workout.model_validate(
                {
                    **_workout_payload("workout-a"),
                    "sets": [
                        {
                            "setId": "set-a",
                            "exerciseId": "bench-press",
                            "setIndex": 0,
                            "reps": 10,
                        }
                    ],
                }
            ),
            _user("user-b"),
        ),
        lambda: workouts_api.replace_workout(
            "workout-a",
            Workout.model_validate(
                {
                    **_workout_payload("workout-a"),
                    "status": "finished",
                    "finishedAt": "2026-08-20T10:00:00Z",
                }
            ),
            _user("user-b"),
        ),
        lambda: workouts_api.delete_workout(
            "workout-a",
            _user("user-b"),
        ),
    )

    for action in foreign_actions:
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(action())
        assert exc_info.value.status_code == 404

    assert owners == {"workout-a": "user-a"}


def test_custom_exercise_and_favorite_ownership(monkeypatch):
    from app.domains.exercises import router as exercises_api

    custom_id = "custom-11111111-2222-3333-4444-555555555555"
    owners = {custom_id: "user-a"}
    favorites = {"user-a": {custom_id}, "user-b": set()}

    async def list_custom_exercise_models(user):
        if user.id == "user-a":
            return [_custom_exercise(custom_id)]
        return []

    async def list_user_favorite_exercise_ids(user):
        return favorites[user.id]

    async def get_custom_exercise_model_by_id(user, exercise_id):
        if owners.get(exercise_id) != user.id:
            return None
        return _custom_exercise(exercise_id)

    async def update_custom_exercise_model(user, exercise_id, payload):
        if owners.get(exercise_id) != user.id:
            return None
        return _custom_exercise(exercise_id).model_copy(
            update=payload.update_payload(),
        )

    async def remove_custom_exercise(user, exercise_id):
        if owners.get(exercise_id) != user.id:
            return False
        del owners[exercise_id]
        return True

    async def mark_exercise_favorite(user, exercise_id):
        favorites[user.id].add(exercise_id)

    monkeypatch.setattr(
        exercises_api,
        "list_custom_exercise_models",
        list_custom_exercise_models,
    )
    monkeypatch.setattr(
        exercises_api,
        "list_user_favorite_exercise_ids",
        list_user_favorite_exercise_ids,
    )
    monkeypatch.setattr(
        exercises_api,
        "get_custom_exercise_model_by_id",
        get_custom_exercise_model_by_id,
    )
    monkeypatch.setattr(
        exercises_api,
        "update_custom_exercise_model",
        update_custom_exercise_model,
    )
    monkeypatch.setattr(
        exercises_api,
        "remove_custom_exercise",
        remove_custom_exercise,
    )
    monkeypatch.setattr(
        exercises_api,
        "mark_exercise_favorite",
        mark_exercise_favorite,
    )

    user_a_list = asyncio.run(
        exercises_api.list_exercises(user=_user("user-a"))
    )
    user_b_list = asyncio.run(
        exercises_api.list_exercises(user=_user("user-b"))
    )

    assert any(item.id == custom_id for item in user_a_list)
    assert not any(item.id == custom_id for item in user_b_list)

    for action in (
        lambda: exercises_api.update_exercise(
            custom_id,
            exercises_api.CustomExerciseUpdate(
                name="Editado por B"
            ),
            _user("user-b"),
        ),
        lambda: exercises_api.delete_exercise(
            custom_id,
            _user("user-b"),
        ),
        lambda: exercises_api.favorite_exercise(
            custom_id,
            _user("user-b"),
        ),
    ):
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(action())
        assert exc_info.value.status_code == 404

    assert favorites["user-b"] == set()
