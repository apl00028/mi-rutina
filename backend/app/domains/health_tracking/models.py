from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


HealthDataSource = Literal[
    "manual",
    "imported",
    "scale",
]


class WeightEntryInput(BaseModel):
    weightKg: float = Field(
        ge=20,
        le=350,
    )
    bodyFatPercent: float | None = Field(
        default=None,
        ge=0,
        le=100,
    )
    muscleMassKg: float | None = Field(
        default=None,
        gt=0,
        le=250,
    )
    bodyWaterPercent: float | None = Field(
        default=None,
        ge=0,
        le=100,
    )
    visceralFatIndex: float | None = Field(
        default=None,
        ge=0,
    )
    source: HealthDataSource = "manual"
    notes: str | None = None


class WeightEntry(WeightEntryInput):
    id: UUID
    measurementDate: date
    createdAt: str | None = None
    updatedAt: str | None = None


class WeeklyCheckInInput(BaseModel):
    fatigue: int | None = Field(
        default=None,
        ge=1,
        le=5,
    )
    hunger: int | None = Field(
        default=None,
        ge=1,
        le=5,
    )
    recovery: int | None = Field(
        default=None,
        ge=1,
        le=5,
    )
    motivation: int | None = Field(
        default=None,
        ge=1,
        le=5,
    )
    waistCm: float | None = Field(
        default=None,
        ge=30,
        le=250,
    )
    dietAdherencePercent: float | None = Field(
        default=None,
        ge=0,
        le=100,
    )
    notes: str | None = None


class WeeklyCheckIn(WeeklyCheckInInput):
    id: UUID
    weekStart: date
    createdAt: str | None = None
    updatedAt: str | None = None

    @model_validator(mode="after")
    def validate_week_start(
        self,
    ) -> "WeeklyCheckIn":
        if self.weekStart.isoweekday() != 1:
            raise ValueError(
                "weekStart must be a Monday"
            )

        return self



class DailyCheckInInput(BaseModel):
    hunger: int | None = Field(
        default=None,
        ge=1,
        le=5,
    )
    dietAdherencePercent: float | None = Field(
        default=None,
        ge=0,
        le=100,
    )
    notes: str | None = None


class DailyCheckIn(DailyCheckInInput):
    id: UUID
    measurementDate: date
    createdAt: str | None = None
    updatedAt: str | None = None


class BodyMeasurementInput(BaseModel):
    waistCm: float | None = Field(
        default=None,
        ge=30,
        le=250,
    )
    abdomenCm: float | None = Field(
        default=None,
        ge=30,
        le=250,
    )
    chestCm: float | None = Field(
        default=None,
        ge=30,
        le=250,
    )
    shouldersCm: float | None = Field(
        default=None,
        ge=30,
        le=250,
    )
    neckCm: float | None = Field(
        default=None,
        ge=20,
        le=100,
    )
    leftArmCm: float | None = Field(
        default=None,
        ge=10,
        le=100,
    )
    rightArmCm: float | None = Field(
        default=None,
        ge=10,
        le=100,
    )
    leftThighCm: float | None = Field(
        default=None,
        ge=20,
        le=150,
    )
    rightThighCm: float | None = Field(
        default=None,
        ge=20,
        le=150,
    )
    notes: str | None = None


class BodyMeasurement(BodyMeasurementInput):
    id: UUID
    measurementDate: date
    createdAt: str | None = None
    updatedAt: str | None = None


class WeightTrendSummary(BaseModel):
    currentWeightKg: float | None = None
    currentBodyFatPercent: float | None = Field(
        default=None,
        ge=0,
        le=100,
    )
    latestMeasurementDate: date | None = None

    recentAverageKg: float | None = None
    previousAverageKg: float | None = None

    changeKg: float | None = None
    changePercent: float | None = None

    recentEntries: int = Field(
        default=0,
        ge=0,
    )
    previousEntries: int = Field(
        default=0,
        ge=0,
    )
