import asyncio

import pytest
from pydantic import ValidationError

from app.core.auth import AuthenticatedUser
from app.domains.trainer.models import (
    RoutineTemplate,
    RoutineTemplateCreate,
    RoutineTemplateUpdate,
    TemplateAssignmentCreate,
)
from app.domains.trainer.service import (
    TrainerAthleteRelationshipNotFound,
    TrainerTemplateNotFound,
    assign_authenticated_trainer_template,
    create_authenticated_trainer_template,
    replace_authenticated_trainer_template,
)


def _trainer() -> AuthenticatedUser:
    return AuthenticatedUser(
        id="trainer-123",
        email="trainer@example.com",
        access_token="access-token",
        role="trainer",
    )


def _routine_data(discipline="strength"):
    return {
        "routineId": "template-1",
        "schemaVersion": "4.2",
        "revision": 1,
        "discipline": discipline,
        "sessions": [],
    }


def _template_row(data=None):
    return {
        "id": "template-1",
        "name": "Base strength",
        "discipline": "strength",
        "data": data or _routine_data(),
        "created_at": "2026-09-02T09:00:00Z",
        "updated_at": "2026-09-02T09:00:00Z",
    }


def _template_model(data=None) -> RoutineTemplate:
    return RoutineTemplate.model_validate(
        _template_row(data=data)
    )


def test_template_service_validates_and_preserves_routine_data(
    monkeypatch,
):
    captured = {}

    async def fake_create(trainer, payload):
        captured["trainer"] = trainer
        captured["payload"] = payload
        return {
            **payload,
            "created_at": "2026-09-02T10:00:00Z",
            "updated_at": "2026-09-02T10:00:00Z",
        }

    monkeypatch.setattr(
        "app.domains.trainer.service.create_routine_template",
        fake_create,
    )

    result = asyncio.run(
        create_authenticated_trainer_template(
            _trainer(),
            RoutineTemplateCreate(
                id="template-1",
                name="Base strength",
                discipline="strength",
                data=_routine_data(),
            ),
        )
    )

    assert result.id == "template-1"
    assert captured["trainer"].id == "trainer-123"
    assert captured["payload"]["data"]["discipline"] == "strength"
    assert "trainer_id" not in captured["payload"]


def test_template_service_sets_missing_routine_id_to_template_id(
    monkeypatch,
):
    captured = {}

    async def fake_create(trainer, payload):
        captured["payload"] = payload
        return {
            **payload,
            "created_at": "2026-09-02T10:00:00Z",
            "updated_at": "2026-09-02T10:00:00Z",
        }

    monkeypatch.setattr(
        "app.domains.trainer.service.create_routine_template",
        fake_create,
    )

    data = _routine_data()
    data.pop("routineId")

    asyncio.run(
        create_authenticated_trainer_template(
            _trainer(),
            RoutineTemplateCreate(
                id="template-1",
                name="Base strength",
                discipline="strength",
                data=data,
            ),
        )
    )

    assert (
        captured["payload"]["data"]["routineId"]
        == "template-1"
    )


def test_template_service_replaces_conflicting_routine_id(
    monkeypatch,
):
    captured = {}

    async def fake_create(trainer, payload):
        captured["payload"] = payload
        return {
            **payload,
            "created_at": "2026-09-02T10:00:00Z",
            "updated_at": "2026-09-02T10:00:00Z",
        }

    monkeypatch.setattr(
        "app.domains.trainer.service.create_routine_template",
        fake_create,
    )

    data = _routine_data()
    data["routineId"] = "client-conflict"

    asyncio.run(
        create_authenticated_trainer_template(
            _trainer(),
            RoutineTemplateCreate(
                id="template-1",
                name="Base strength",
                discipline="strength",
                data=data,
            ),
        )
    )

    assert (
        captured["payload"]["data"]["routineId"]
        == "template-1"
    )


def test_replace_template_uses_url_template_id_as_routine_id(
    monkeypatch,
):
    captured = {}

    async def fake_replace(trainer, template_id, payload):
        captured["template_id"] = template_id
        captured["payload"] = payload
        return {
            "id": template_id,
            **payload,
            "created_at": "2026-09-02T10:00:00Z",
            "updated_at": "2026-09-02T10:00:00Z",
        }

    monkeypatch.setattr(
        "app.domains.trainer.service.replace_routine_template",
        fake_replace,
    )

    data = _routine_data()
    data["routineId"] = "client-conflict"

    asyncio.run(
        replace_authenticated_trainer_template(
            _trainer(),
            "url-template-id",
            RoutineTemplateUpdate(
                name="Base strength",
                discipline="strength",
                data=data,
            ),
        )
    )

    assert captured["template_id"] == "url-template-id"
    assert (
        captured["payload"]["data"]["routineId"]
        == "url-template-id"
    )


def test_template_service_rejects_mismatched_data_discipline():
    with pytest.raises(ValueError):
        asyncio.run(
            create_authenticated_trainer_template(
                _trainer(),
                RoutineTemplateCreate(
                    id="template-1",
                    name="Base strength",
                    discipline="strength",
                    data=_routine_data(
                        discipline="swimming"
                    ),
                ),
            )
        )


def test_template_service_preserves_swimming_routine_validation():
    with pytest.raises(ValidationError):
        asyncio.run(
            create_authenticated_trainer_template(
                _trainer(),
                RoutineTemplateCreate(
                    id="template-1",
                    name="Pool base",
                    discipline="swimming",
                    data={
                        "routineId": "template-1",
                        "schemaVersion": "4.2",
                        "revision": 1,
                        "discipline": "swimming",
                        "sessions": [],
                    },
                ),
            )
        )


def test_assign_template_builds_independent_snapshot_with_provenance(
    monkeypatch,
):
    captured = {}
    template_data = _routine_data()
    template_data["sessions"] = [
        {
            "sessionId": "session-a",
            "exercises": [
                {
                    "exerciseId": "bench-press",
                }
            ],
        }
    ]

    async def fake_get(trainer, template_id):
        assert trainer.id == "trainer-123"
        assert template_id == "template-1"
        return _template_model(
            data=template_data
        )

    async def fake_relationship(trainer, athlete_id):
        assert trainer.id == "trainer-123"
        assert athlete_id == "athlete-1"
        return {
            "athlete_id": "athlete-1",
            "status": "active",
        }

    async def fake_assign(trainer, **kwargs):
        captured["kwargs"] = kwargs
        return {
            "assignment_id": "assignment-1",
            "athlete_id": kwargs["athlete_id"],
            "template_id": kwargs["template_id"],
            "routine_id": kwargs["routine_id"],
            "discipline": "strength",
            "assigned_at": "2026-09-02T10:00:00Z",
        }

    monkeypatch.setattr(
        "app.domains.trainer.service.get_authenticated_trainer_template",
        fake_get,
    )
    monkeypatch.setattr(
        "app.domains.trainer.service.get_active_trainer_athlete",
        fake_relationship,
    )
    monkeypatch.setattr(
        "app.domains.trainer.service.assign_routine_template",
        fake_assign,
    )

    result = asyncio.run(
        assign_authenticated_trainer_template(
            _trainer(),
            "template-1",
            TemplateAssignmentCreate(
                athlete_id="athlete-1",
                routine_id="athlete-routine-1",
            ),
        )
    )

    template_data["sessions"][0]["sessionId"] = (
        "later-template-edit"
    )

    assert result.assignment_id == "assignment-1"
    assert captured["kwargs"]["athlete_id"] == "athlete-1"
    assert captured["kwargs"]["template_id"] == "template-1"
    assert captured["kwargs"]["routine_id"] == "athlete-routine-1"
    assert "discipline" not in captured["kwargs"]
    assert "routine_data" not in captured["kwargs"]
    assert "assigned_at" not in captured["kwargs"]
    assert result.discipline == "strength"
    assert result.assigned_at == "2026-09-02T10:00:00Z"


def test_assign_template_rejects_foreign_template(monkeypatch):
    async def fake_get(trainer, template_id):
        return None

    monkeypatch.setattr(
        "app.domains.trainer.service.get_authenticated_trainer_template",
        fake_get,
    )

    with pytest.raises(
        TrainerTemplateNotFound
    ):
        asyncio.run(
            assign_authenticated_trainer_template(
                _trainer(),
                "foreign-template",
                TemplateAssignmentCreate(
                    athlete_id="athlete-1",
                    routine_id="athlete-routine-1",
                ),
            )
        )


def test_assign_template_rejects_unrelated_or_inactive_athlete(
    monkeypatch,
):
    async def fake_get(trainer, template_id):
        return _template_model()

    async def fake_relationship(trainer, athlete_id):
        return None

    monkeypatch.setattr(
        "app.domains.trainer.service.get_authenticated_trainer_template",
        fake_get,
    )
    monkeypatch.setattr(
        "app.domains.trainer.service.get_active_trainer_athlete",
        fake_relationship,
    )

    with pytest.raises(
        TrainerAthleteRelationshipNotFound
    ):
        asyncio.run(
            assign_authenticated_trainer_template(
                _trainer(),
                "template-1",
                TemplateAssignmentCreate(
                    athlete_id="athlete-1",
                    routine_id="athlete-routine-1",
                ),
            )
        )


def test_assign_template_preserves_snapshot_routine_validation(
    monkeypatch,
):
    async def fake_get(trainer, template_id):
        row = {
            **_template_row(),
            "discipline": "swimming",
            "data": {
                "routineId": "template-1",
                "schemaVersion": "4.2",
                "revision": 1,
                "discipline": "swimming",
                "sessions": [],
            },
        }
        return RoutineTemplate.model_validate(row)

    async def fake_relationship(trainer, athlete_id):
        return {
            "athlete_id": athlete_id,
            "status": "active",
        }

    monkeypatch.setattr(
        "app.domains.trainer.service.get_authenticated_trainer_template",
        fake_get,
    )
    monkeypatch.setattr(
        "app.domains.trainer.service.get_active_trainer_athlete",
        fake_relationship,
    )

    with pytest.raises(ValidationError):
        asyncio.run(
            assign_authenticated_trainer_template(
                _trainer(),
                "template-1",
                TemplateAssignmentCreate(
                    athlete_id="athlete-1",
                    routine_id="swim-routine-1",
                ),
            )
        )
