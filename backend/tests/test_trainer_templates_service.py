import asyncio

import pytest
from pydantic import ValidationError

from app.core.auth import AuthenticatedUser
from app.domains.trainer.models import (
    RoutineTemplateCreate,
    RoutineTemplateUpdate,
)
from app.domains.trainer.service import (
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
