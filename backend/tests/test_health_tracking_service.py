from datetime import date
from uuid import uuid4

from app.domains.health_tracking.models import (
    WeightEntry,
)
from app.domains.health_tracking.service import (
    build_weight_trend,
)


def entry(
    measurement_date: date,
    weight: float,
) -> WeightEntry:
    return WeightEntry(
        id=uuid4(),
        measurementDate=measurement_date,
        weightKg=weight,
        source="manual",
    )


def test_empty_weight_trend():
    summary = build_weight_trend([])

    assert summary.currentWeightKg is None
    assert summary.changeKg is None
    assert summary.recentEntries == 0
    assert summary.previousEntries == 0


def test_weight_trend_compares_two_windows():
    entries = [
        entry(
            date(2026, 8, 11),
            76.0,
        ),
        entry(
            date(2026, 8, 12),
            76.0,
        ),
        entry(
            date(2026, 8, 18),
            75.0,
        ),
        entry(
            date(2026, 8, 24),
            75.0,
        ),
    ]

    summary = build_weight_trend(
        entries
    )

    assert summary.currentWeightKg == 75.0
    assert summary.previousAverageKg == 76.0
    assert summary.recentAverageKg == 75.0
    assert summary.changeKg == -1.0
    assert summary.changePercent == -1.32


def test_weight_trend_requires_previous_window():
    summary = build_weight_trend([
        entry(
            date(2026, 8, 24),
            75.0,
        ),
    ])

    assert summary.currentWeightKg == 75.0
    assert summary.recentAverageKg == 75.0
    assert summary.previousAverageKg is None
    assert summary.changeKg is None
