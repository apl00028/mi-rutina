from app.services import workouts as service


def workout_row():
    return {
        "id": "workout-1",
        "user_id": "user-123",
        "created_at": "2026-08-17T10:00:00Z",
        "data": {
            "workoutId": "workout-1",
            "routineId": "routine-1",
            "sessionId": "session-a",
            "status": "in_progress",
            "sets": [],
        },
    }


def test_workout_payload_strips_client_user_fields():
    row = workout_row()
    row["data"]["user_id"] = "attacker-user"
    row["data"]["userId"] = "attacker-user"
    row["data"]["owner_id"] = "attacker-user"
    row["data"]["ownerId"] = "attacker-user"
    row["data"]["created_by"] = "attacker-user"
    row["data"]["createdBy"] = "attacker-user"
    row["data"]["is_admin"] = True
    row["data"]["isAdmin"] = True

    workout = service.workout_row_to_model(row)
    payload = service.workout_to_storage_payload(
        workout
    )

    dumped = workout.model_dump(exclude_none=True)
    for field in (
        "user_id",
        "userId",
        "owner_id",
        "ownerId",
        "created_by",
        "createdBy",
        "is_admin",
        "isAdmin",
    ):
        assert field not in dumped
        assert field not in payload
