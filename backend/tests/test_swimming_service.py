from datetime import datetime, timezone

import asyncio

from app.core.auth import AuthenticatedUser
from app.domains.swimming.models import SwimmingFitSession
from app.domains.swimming.service import (
    import_user_swimming_fit,
    swimming_to_storage_payload,
)


USER = AuthenticatedUser(
    id="user-123",
    email="test@example.com",
    access_token="token-123",
)


def sample_session():
    return SwimmingFitSession(
        start_time=datetime(
            2026,
            8,
            27,
            15,
            51,
            58,
            tzinfo=timezone.utc,
        ),
        pool_length_meters=25,
        distance_meters=1200,
        total_strokes=758,
        lengths=[],
    )


def test_swimming_storage_payload_is_stable():
    session = sample_session()

    payload = swimming_to_storage_payload(
        session,
        "a" * 64,
    )

    assert payload["id"] == (
        "garmin-fit-" + "a" * 24
    )
    assert payload["source"] == "garmin_fit"
    assert payload["source_file_hash"] == "a" * 64
    assert payload["parser_version"] == 1
    assert payload["started_at"] == (
        "2026-08-27T15:51:58+00:00"
    )
    assert payload["data"]["distance_meters"] == 1200


def test_new_fit_is_parsed_and_created(
    monkeypatch,
    tmp_path,
):
    from app.domains.swimming import service

    path = tmp_path / "activity.fit"
    contents = b"fit-contents"
    path.write_bytes(contents)

    session = sample_session()

    async def fake_get(user, source_file_hash):
        assert user.id == "user-123"
        assert len(source_file_hash) == 64
        return None

    def fake_parse(parsed_path):
        assert parsed_path == path
        return session

    async def fake_create(user, payload):
        assert user.id == "user-123"
        assert payload["source"] == "garmin_fit"
        assert payload["data"]["total_strokes"] == 758

        return {
            "data": payload["data"],
        }

    monkeypatch.setattr(
        service,
        "get_swimming_session_by_hash",
        fake_get,
    )
    monkeypatch.setattr(
        service,
        "parse_swimming_fit",
        fake_parse,
    )
    monkeypatch.setattr(
        service,
        "create_swimming_session",
        fake_create,
    )

    result = asyncio.run(
        import_user_swimming_fit(
            USER,
            path,
            contents,
        )
    )

    assert result.distance_meters == 1200
    assert result.total_strokes == 758


def test_existing_fit_is_returned_without_reparse(
    monkeypatch,
    tmp_path,
):
    from app.domains.swimming import service

    path = tmp_path / "activity.fit"
    contents = b"same-fit"
    path.write_bytes(contents)

    existing = sample_session().model_dump(
        mode="json",
        exclude_none=True,
    )

    async def fake_get(user, source_file_hash):
        return {
            "data": existing,
        }

    def fail_parse(path):
        raise AssertionError(
            "existing FIT must not be reparsed"
        )

    async def fail_create(user, payload):
        raise AssertionError(
            "existing FIT must not be recreated"
        )

    monkeypatch.setattr(
        service,
        "get_swimming_session_by_hash",
        fake_get,
    )
    monkeypatch.setattr(
        service,
        "parse_swimming_fit",
        fail_parse,
    )
    monkeypatch.setattr(
        service,
        "create_swimming_session",
        fail_create,
    )

    result = asyncio.run(
        import_user_swimming_fit(
            USER,
            path,
            contents,
        )
    )

    assert result.distance_meters == 1200
    assert result.total_strokes == 758
