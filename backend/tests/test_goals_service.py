from uuid import UUID

import pytest

from app.core.auth import AuthenticatedUser
from app.domains.goals import repository, service
from app.domains.goals.models import (
    GoalCreate,
    GoalStatusUpdate,
    GoalUpdate,
    InvalidGoalTaxonomy,
)


GOAL_ID = "11111111-1111-4111-8111-111111111111"
USER_ID = "22222222-2222-4222-8222-222222222222"


def user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=USER_ID,
        role="user",
        access_token="token",
    )


def row(**overrides):
    return {
        "id": GOAL_ID,
        "user_id": USER_ID,
        "category": "endurance",
        "kind": "running",
        "variant": "5k",
        "target_date": None,
        "status": "active",
        "created_by_user_id": USER_ID,
        "created_at": "2026-09-09T10:00:00Z",
        "updated_at": "2026-09-09T10:00:00Z",
        **overrides,
    }


def test_active_and_history_can_be_empty(
    monkeypatch,
):
    async def no_active(actor):
        assert actor.id == USER_ID
        return None

    async def no_history(actor):
        assert actor.id == USER_ID
        return []

    monkeypatch.setattr(
        repository,
        "get_active_goal",
        no_active,
    )
    monkeypatch.setattr(
        repository,
        "list_goals",
        no_history,
    )

    async def run():
        assert await service.get_user_active_goal(
            user()
        ) is None
        assert await service.list_user_goals(
            user()
        ) == []

    import asyncio
    asyncio.run(run())


def test_create_preserves_minimal_contract(
    monkeypatch,
):
    captured = {}

    async def create(actor, payload):
        captured.update(payload)
        return row()

    monkeypatch.setattr(
        repository,
        "create_goal",
        create,
    )

    import asyncio
    result = asyncio.run(
        service.create_user_goal(
            user(),
            GoalCreate(
                category="endurance",
                kind="running",
                variant="5k",
            ),
        )
    )

    assert result.id == UUID(GOAL_ID)
    assert captured == {
        "category": "endurance",
        "kind": "running",
        "variant": "5k",
        "target_date": None,
    }


def test_update_validates_merged_taxonomy(
    monkeypatch,
):
    async def get(actor, goal_id):
        return row()

    monkeypatch.setattr(repository, "get_goal", get)

    import asyncio
    with pytest.raises(InvalidGoalTaxonomy):
        asyncio.run(
            service.update_user_goal(
                user(),
                GOAL_ID,
                GoalUpdate(kind="swimming"),
            )
        )


@pytest.mark.parametrize(
    "closing_status",
    ["completed", "abandoned"],
)
def test_closing_goal_removes_it_from_active_state(
    monkeypatch,
    closing_status,
):
    updates = []

    async def get(actor, goal_id):
        return row()

    async def update(
        actor,
        goal_id,
        payload,
        *,
        active_only=False,
    ):
        updates.append((payload, active_only))
        return row(status=payload["status"])

    monkeypatch.setattr(repository, "get_goal", get)
    monkeypatch.setattr(repository, "update_goal", update)

    import asyncio
    result = asyncio.run(
        service.close_user_goal(
            user(),
            GOAL_ID,
            GoalStatusUpdate(status=closing_status),
        )
    )

    assert result is not None
    assert result.status == closing_status
    assert updates == [
        ({"status": closing_status}, True)
    ]


def test_goal_from_another_user_is_not_modified(
    monkeypatch,
):
    async def missing(actor, goal_id):
        assert actor.id == USER_ID
        return None

    monkeypatch.setattr(
        repository,
        "get_goal",
        missing,
    )

    import asyncio
    result = asyncio.run(
        service.update_user_goal(
            user(),
            GOAL_ID,
            GoalUpdate(target_date=None),
        )
    )
    assert result is None


def test_malformed_storage_row_is_rejected():
    with pytest.raises(
        RuntimeError,
        match="Unexpected Supabase response",
    ):
        service.goal_from_row({
            "id": "private-invalid-row"
        })
