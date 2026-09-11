import asyncio

import pytest
from fastapi import HTTPException

from app.domains.integrations import service


class FakeUser:
    id = "athlete-a"


def test_disconnected_account_is_rejected(
    monkeypatch,
):
    async def disconnected(_user):
        return None

    monkeypatch.setattr(
        service,
        "get_health_connect_integration",
        disconnected,
    )

    with pytest.raises(
        HTTPException
    ) as exc_info:
        asyncio.run(
            service
            .require_health_connect_enabled(
                FakeUser()
            )
        )

    assert (
        exc_info.value.status_code
        == 403
    )

    assert (
        "not connected"
        in str(
            exc_info.value.detail
        ).lower()
    )


def test_connected_account_is_allowed(
    monkeypatch,
):
    async def connected(_user):
        return {
            "user_id":
                "athlete-a",
            "provider":
                "health_connect",
            "enabled":
                True,
        }

    monkeypatch.setattr(
        service,
        "get_health_connect_integration",
        connected,
    )

    asyncio.run(
        service
        .require_health_connect_enabled(
            FakeUser()
        )
    )
