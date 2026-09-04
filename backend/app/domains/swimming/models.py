from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SwimmingLength(BaseModel):
    start_time: datetime | None = None
    duration_seconds: float | None = None
    distance_meters: float | None = None
    total_strokes: int | None = None
    average_stroke_rate_spm: float | None = None
    swim_stroke: str | None = None
    length_type: str | None = None


class SwimmingFitSession(BaseModel):
    start_time: datetime | None = None
    pool_length_meters: float | None = None
    distance_meters: float | None = None

    total_elapsed_time_seconds: float | None = None
    total_timer_time_seconds: float | None = None
    total_moving_time_seconds: float | None = None

    heart_rate_average_bpm: int | None = None
    heart_rate_max_bpm: int | None = None

    total_strokes: int | None = None
    average_stroke_rate_spm: float | None = None

    average_speed_meters_per_second: float | None = None
    max_speed_meters_per_second: float | None = None
    average_pace_seconds_per_100m: float | None = None

    total_calories: int | None = None
    aerobic_training_effect: float | None = None
    anaerobic_training_effect: float | None = None

    lengths: list[SwimmingLength]


class SwimmingHealthConnectDistanceRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    startTime: datetime
    endTime: datetime
    durationSeconds: float = Field(ge=0)
    distanceMeters: float = Field(ge=0)


class SwimmingHealthConnectSession(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sourcePackage: str = Field(min_length=1)
    startTime: datetime
    endTime: datetime
    durationSeconds: float = Field(ge=0)
    segmentCount: int = Field(default=0, ge=0)
    segmentRepetitions: int = Field(default=0, ge=0)

    distanceMeters: float | None = Field(default=None, ge=0)
    distanceRecordCount: int = Field(default=0, ge=0)
    rawDistanceTotalMeters: float = Field(default=0, ge=0)
    distanceRecords: list[
        SwimmingHealthConnectDistanceRecord
    ] = Field(default_factory=list)

    heartRateAverageBpm: int | None = Field(default=None, ge=0)
    heartRateMaxBpm: int | None = Field(default=None, ge=0)
    heartRateSampleCount: int = Field(default=0, ge=0)

    speedSampleCount: int = Field(default=0, ge=0)
    speedAverageMetersPerSecond: float | None = Field(
        default=None,
        ge=0,
    )
    speedMaxMetersPerSecond: float | None = Field(
        default=None,
        ge=0,
    )
    paceSecondsPer100mFromSpeed: float | None = Field(
        default=None,
        ge=0,
    )


class SwimmingHealthConnectSyncRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sessions: list[SwimmingHealthConnectSession]


class SwimmingHealthConnectSyncResult(BaseModel):
    synced: int
