from datetime import date
from uuid import UUID

import pytest
from pydantic import ValidationError

from app.domains.goals.models import (
    Goal,
    GoalCreate,
    GoalUpdate,
)


GOAL_ID = UUID(
    "11111111-1111-4111-8111-111111111111"
)
USER_ID = UUID(
    "22222222-2222-4222-8222-222222222222"
)


def test_goal_without_target_date_is_valid():
    goal = GoalCreate(
        category="health",
        kind="general_health",
    )
    assert goal.target_date is None
    assert goal.variant is None


def test_goal_with_target_date_is_valid():
    goal = GoalCreate(
        category="endurance",
        kind="running",
        variant="10k",
        target_date=date(2027, 4, 18),
    )
    assert goal.target_date == date(2027, 4, 18)


def test_category_and_kind_must_match():
    with pytest.raises(ValidationError):
        GoalCreate(
            category="health",
            kind="triathlon",
        )


def test_variant_is_limited_to_supported_kind():
    assert GoalCreate(
        category="endurance",
        kind="triathlon",
        variant="olympic",
    ).variant == "olympic"

    with pytest.raises(ValidationError):
        GoalCreate(
            category="endurance",
            kind="swimming",
            variant="sprint",
        )

    with pytest.raises(ValidationError):
        GoalCreate(
            category="endurance",
            kind="running",
            variant="olympic",
        )


def test_update_requires_an_editable_field():
    with pytest.raises(ValidationError):
        GoalUpdate()


def test_goal_parses_database_timestamps_and_status():
    goal = Goal.model_validate({
        "id": str(GOAL_ID),
        "user_id": str(USER_ID),
        "category": "strength",
        "kind": "strength_gain",
        "variant": None,
        "target_date": None,
        "status": "completed",
        "created_by_user_id": str(USER_ID),
        "created_at": "2026-09-09T10:00:00Z",
        "updated_at": "2026-09-09T11:00:00Z",
    })
    assert goal.status == "completed"
    assert goal.updated_at > goal.created_at
