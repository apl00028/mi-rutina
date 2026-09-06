import re
from typing import Annotated, Literal

from pydantic import (
    AfterValidator, AwareDatetime, BaseModel, BeforeValidator,
    ConfigDict, Field, field_validator, model_validator,
)


def nonblank(value: str) -> str:
    if not value.strip():
        raise ValueError("Must not be blank")
    return value


Nonblank = Annotated[str, Field(strict=True, min_length=1), AfterValidator(nonblank)]
Package = Annotated[Nonblank, Field(max_length=256)]
RecordId = Annotated[Nonblank, Field(max_length=1024)]
Number = Annotated[float, Field(strict=True, ge=0, allow_inf_nan=False)]


def numeric_integer(value):
    # SQL accepts JSON numeric 2.0 as a count, but not strings or booleans.
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("Must be an integer number")
    return value


Count = Annotated[int, BeforeValidator(numeric_integer), Field(ge=0)]
ExerciseType = Annotated[Literal[33, 34], BeforeValidator(numeric_integer)]


class RunningData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Annotated[Literal[1], BeforeValidator(numeric_integer)]
    exercise_type: ExerciseType
    distance_meters: Number | None = None
    heart_rate_average_bpm: Number | None = None
    heart_rate_max_bpm: Number | None = None
    heart_rate_sample_count: Count | None = None
    speed_average_meters_per_second: Number | None = None
    speed_max_meters_per_second: Number | None = None
    speed_sample_count: Count | None = None
    lap_count: Count | None = None
    segment_count: Count | None = None
    has_route: Annotated[bool, Field(strict=True)] | None = None


class RunningSession(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Nonblank
    source: Literal["health_connect"]
    source_package: Package
    source_record_id: RecordId
    started_at: AwareDatetime
    ended_at: AwareDatetime
    data: RunningData

    @model_validator(mode="after")
    def ordered_times(self):
        if self.ended_at < self.started_at:
            raise ValueError("ended_at must not precede started_at")
        return self


class RunningHealthConnectSession(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recordId: RecordId
    sourcePackage: Package
    exerciseType: ExerciseType
    startTime: AwareDatetime
    endTime: AwareDatetime
    durationSeconds: Number | None = None
    lapCount: Count | None = None
    segmentCount: Count | None = None
    hasRoute: Annotated[bool, Field(strict=True)] | None = None
    distanceMeters: Number | None = None
    heartRateAverageBpm: Number | None = None
    heartRateMaxBpm: Number | None = None
    heartRateSampleCount: Count | None = None
    speedAverageMetersPerSecond: Number | None = None
    speedMaxMetersPerSecond: Number | None = None
    speedSampleCount: Count | None = None
    paceSecondsPerKmFromSpeed: Number | None = None
    distanceError: str | None = None
    heartRateError: str | None = None
    speedError: str | None = None

    @field_validator("startTime", "endTime", mode="before")
    @classmethod
    def explicit_offset(cls, value):
        if not isinstance(value, str) or not re.fullmatch(
            r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})", value
        ):
            raise ValueError("Timestamp must include seconds and an explicit timezone offset")
        return value

    @model_validator(mode="after")
    def ordered_times(self):
        if self.endTime < self.startTime:
            raise ValueError("endTime must not precede startTime")
        return self


class RunningSyncRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sessions: list[RunningHealthConnectSession] = Field(min_length=1, max_length=25)


class RunningSyncError(BaseModel):
    status_code: Literal[502, 503]
    detail: str


class RunningSyncItem(BaseModel):
    index: int
    recordId: str
    sourcePackage: str
    session: RunningSession | None = None
    error: RunningSyncError | None = None


class RunningSyncResult(BaseModel):
    synced: int
    results: list[RunningSyncItem]
