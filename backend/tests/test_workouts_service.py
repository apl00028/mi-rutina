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

    workout = service.workout_row_to_model(row)
    payload = service.workout_to_storage_payload(
        workout
    )

    assert "user_id" not in workout.model_dump(
        exclude_none=True
    )
    assert "userId" not in workout.model_dump(
        exclude_none=True
    )
    assert "user_id" not in payload
    assert "userId" not in payload
