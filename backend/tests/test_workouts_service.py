from app.domains.workouts import service


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


def test_duration_rpe_round_trips_through_storage_without_replacing_legacy_rir():
    row = workout_row()
    row["data"]["sets"] = [
        {"setId": "duration", "exerciseId": "plank", "setIndex": 0,
         "durationSeconds": 75, "rpe": 8.5, "rir": 2,
         "completedAt": "2026-09-09T08:00:00Z"},
        {"setId": "legacy", "exerciseId": "press", "setIndex": 0, "rir": 2},
    ]
    payload = service.workout_to_storage_payload(service.workout_row_to_model(row))
    assert payload["sets"][0]["rpe"] == 8.5
    assert payload["sets"][0]["rir"] == 2
    assert payload["sets"][0]["durationSeconds"] == 75
    assert payload["sets"][0]["completedAt"] == "2026-09-09T08:00:00Z"
    assert "rpe" not in payload["sets"][1]
    restored = service.workout_row_to_model({**row, "data": payload})
    assert restored.sets[0].rpe == 8.5
    assert restored.sets[1].rir == 2
