from typing import Any, Literal

from pydantic import BaseModel, Field


TelemetryEventName = Literal[
    "page_view",
    "workout_started",
    "workout_completed",
    "coach_request",
    "health_connect_read",
    "health_connect_error",
]


class TelemetryEventRequest(BaseModel):
    event_name: TelemetryEventName

    route: str | None = Field(
        default=None,
        max_length=160,
    )

    platform: str | None = Field(
        default=None,
        max_length=32,
    )

    app_version: str | None = Field(
        default=None,
        max_length=32,
    )

    metadata: dict[str, Any] = Field(
        default_factory=dict,
    )
