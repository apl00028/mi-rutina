import asyncio

from auth import AuthenticatedUser
from app.services import routines as service


def routine_row():
    return {
        "id": "routine-1",
        "user_id": "user-123",
        "created_at": "2026-08-17T10:00:00Z",
        "updated_at": "2026-08-17T11:00:00Z",
        "data": {
            "schemaVersion": "4.2",
            "routineId": "routine-1",
            "revision": 1,
            "name": "Fuerza",
            "sessions": [
                {
                    "sessionId": "session-a",
                    "order": 1,
                    "label": "A",
                    "name": "Sesión A",
                    "focus": "Empuje",
                    "estimatedDurationMinutes": 60,
                    "exercises": [
                        {
                            "exerciseId": "bench-press",
                            "name": "Press de banca",
                            "sets": 3,
                            "target": "8-10 reps",
                        }
                    ],
                }
            ],
        },
    }


def test_routine_row_to_model_preserves_canonical_data():
    routine = service.routine_row_to_model(routine_row())

    assert routine.model_dump(exclude_none=True) == {
        "schemaVersion": "4.2",
        "routineId": "routine-1",
        "revision": 1,
        "name": "Fuerza",
        "createdAt": "2026-08-17T10:00:00Z",
        "updatedAt": "2026-08-17T11:00:00Z",
        "sessions": [
            {
                "sessionId": "session-a",
                "order": 1,
                "label": "A",
                "name": "Sesión A",
                "focus": "Empuje",
                "estimatedDurationMinutes": 60,
                "exercises": [
                    {
                        "exerciseId": "bench-press",
                        "name": "Press de banca",
                        "sets": 3,
                        "target": "8-10 reps",
                    }
                ],
            }
        ],
    }


def test_list_user_routines_maps_rows(monkeypatch):
    async def fake_list_routines(user):
        assert user.id == "user-123"
        return [routine_row()]

    monkeypatch.setattr(service, "list_routines", fake_list_routines)

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="token-123",
    )

    routines = asyncio.run(service.list_user_routines(user))

    assert [routine.routineId for routine in routines] == ["routine-1"]


def test_get_user_routine_by_id_returns_none_for_missing(monkeypatch):
    async def fake_get_routine_by_id(user, routine_id):
        return None

    monkeypatch.setattr(service, "get_routine_by_id", fake_get_routine_by_id)

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="token-123",
    )

    routine = asyncio.run(service.get_user_routine_by_id(user, "routine-1"))

    assert routine is None


def test_routine_to_storage_payload_excludes_row_timestamps():
    routine = service.routine_row_to_model(routine_row())

    assert service.routine_to_storage_payload(routine) == {
        "schemaVersion": "4.2",
        "routineId": "routine-1",
        "revision": 1,
        "name": "Fuerza",
        "sessions": routine_row()["data"]["sessions"],
    }


def test_routine_payload_strips_client_user_fields():
    row = routine_row()
    row["data"]["user_id"] = "attacker-user"
    row["data"]["userId"] = "attacker-user"
    row["data"]["owner_id"] = "attacker-user"
    row["data"]["ownerId"] = "attacker-user"
    row["data"]["created_by"] = "attacker-user"
    row["data"]["createdBy"] = "attacker-user"
    row["data"]["is_admin"] = True
    row["data"]["isAdmin"] = True

    routine = service.routine_row_to_model(row)
    payload = service.routine_to_storage_payload(routine)

    dumped = routine.model_dump(exclude_none=True)
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


def test_create_user_routine_maps_created_row(monkeypatch):
    captured = {}

    async def fake_create_routine(user, routine):
        captured["user_id"] = user.id
        captured["routine"] = routine
        return {
            "id": "routine-1",
            "user_id": "user-123",
            "data": routine,
        }

    monkeypatch.setattr(service, "create_routine", fake_create_routine)

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="token-123",
    )
    routine = service.routine_row_to_model(routine_row())

    created = asyncio.run(service.create_user_routine(user, routine))

    assert created.routineId == "routine-1"
    assert captured["user_id"] == "user-123"
    assert captured["routine"]["sessions"] == routine_row()["data"]["sessions"]


def test_replace_user_routine_maps_replaced_row(monkeypatch):
    captured = {}

    async def fake_replace_routine(user, routine_id, routine):
        captured["user_id"] = user.id
        captured["routine_id"] = routine_id
        captured["routine"] = routine
        return {
            "id": routine_id,
            "user_id": "user-123",
            "data": routine,
        }

    monkeypatch.setattr(service, "replace_routine", fake_replace_routine)

    user = AuthenticatedUser(
        id="user-123",
        email="test@example.com",
        access_token="token-123",
    )
    routine = service.routine_row_to_model(routine_row())

    replaced = asyncio.run(service.replace_user_routine(user, "routine-1", routine))

    assert replaced.routineId == "routine-1"
    assert captured["user_id"] == "user-123"
    assert captured["routine_id"] == "routine-1"
