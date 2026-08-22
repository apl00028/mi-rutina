from datetime import date
from uuid import UUID

import pytest
from pydantic import ValidationError

from app.domains.health_tracking.models import (
    DailyCheckInInput,
    WeeklyCheckIn,
    WeightEntry,
    WeightEntryInput,
)


ENTRY_ID = UUID(
    "11111111-1111-1111-1111-111111111111"
)


def test_valid_weight_entry():
    entry = WeightEntry(
        id=ENTRY_ID,
        measurementDate=date(2026, 8, 24),
        weightKg=75.4,
        bodyFatPercent=18.2,
        source="manual",
    )

    assert entry.weightKg == 75.4
    assert entry.bodyFatPercent == 18.2


def test_weight_must_be_plausible():
    with pytest.raises(ValidationError):
        WeightEntryInput(
            weightKg=5,
        )


def test_body_fat_must_be_percentage():
    with pytest.raises(ValidationError):
        WeightEntryInput(
            weightKg=75,
            bodyFatPercent=120,
        )


def test_valid_weekly_checkin():
    checkin = WeeklyCheckIn(
        id=ENTRY_ID,
        weekStart=date(2026, 8, 24),
        fatigue=3,
        hunger=2,
        recovery=4,
        dietAdherencePercent=90,
    )

    assert checkin.fatigue == 3
    assert checkin.recovery == 4


def test_weekly_checkin_must_start_on_monday():
    with pytest.raises(ValidationError):
        WeeklyCheckIn(
            id=ENTRY_ID,
            weekStart=date(2026, 8, 25),
            fatigue=3,
        )


def test_checkin_scales_are_one_to_five():
    with pytest.raises(ValidationError):
        WeeklyCheckIn(
            id=ENTRY_ID,
            weekStart=date(2026, 8, 24),
            fatigue=6,
        )



def test_extended_body_metrics_are_valid():
    entry = WeightEntry(
        id=ENTRY_ID,
        measurementDate=date(2026, 8, 24),
        weightKg=75.4,
        bodyFatPercent=18.2,
        muscleMassKg=60.5,
        bodyWaterPercent=57.3,
        visceralFatIndex=5,
        source="scale",
    )

    assert entry.muscleMassKg == 60.5
    assert entry.bodyWaterPercent == 57.3
    assert entry.visceralFatIndex == 5


def test_daily_checkin_validates_hunger():
    valid = DailyCheckInInput(
        hunger=4,
        dietAdherencePercent=90,
    )

    assert valid.hunger == 4

    with pytest.raises(ValidationError):
        DailyCheckInInput(
            hunger=6,
        )
