from hashlib import sha256
from typing import Any

import httpx

from app.core.auth import AuthenticatedUser
from app.domains.swimming.fit_parser import (
    parse_swimming_fit,
)
from app.domains.swimming.models import (
    SwimmingFitSession,
)
from app.domains.swimming.repository import (
    create_swimming_session,
    get_swimming_session_by_hash,
    list_swimming_sessions,
)


PARSER_VERSION = 1


def swimming_row_to_model(
    row: dict[str, Any],
) -> SwimmingFitSession:
    data = row.get("data")

    if not isinstance(data, dict):
        raise RuntimeError(
            "Unexpected Supabase response."
        )

    return SwimmingFitSession.model_validate(
        data
    )


def swimming_to_storage_payload(
    session: SwimmingFitSession,
    source_file_hash: str,
) -> dict[str, Any]:
    if session.start_time is None:
        raise ValueError(
            "Swimming FIT session has no start time"
        )

    return {
        "id":
            f"garmin-fit-{source_file_hash[:24]}",
        "source":
            "garmin_fit",
        "source_file_hash":
            source_file_hash,
        "started_at":
            session.start_time.isoformat(),
        "parser_version":
            PARSER_VERSION,
        "data":
            session.model_dump(
                mode="json",
                exclude_none=True,
            ),
    }


async def list_user_swimming_sessions(
    user: AuthenticatedUser,
) -> list[SwimmingFitSession]:
    rows = await list_swimming_sessions(
        user
    )

    return [
        swimming_row_to_model(row)
        for row in rows
    ]


async def import_user_swimming_fit(
    user: AuthenticatedUser,
    path,
    contents: bytes,
) -> SwimmingFitSession:
    source_file_hash = sha256(
        contents
    ).hexdigest()

    existing = (
        await get_swimming_session_by_hash(
            user,
            source_file_hash,
        )
    )

    if existing is not None:
        return swimming_row_to_model(
            existing
        )

    session = parse_swimming_fit(path)

    payload = swimming_to_storage_payload(
        session,
        source_file_hash,
    )

    try:
        row = await create_swimming_session(
            user,
            payload,
        )
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code != 409:
            raise

        existing = await get_swimming_session_by_hash(
            user,
            source_file_hash,
        )

        if existing is None:
            raise

        row = existing

    return swimming_row_to_model(
        row
    )
