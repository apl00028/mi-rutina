from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.domains.swimming import fit_parser
from app.domains.swimming.fit_parser import (
    NonSwimmingFitError,
    parse_swimming_fit,
)


FIT_PATH = Path(
    "/data/24138679140_ACTIVITY.fit"
)


class FakeFitDataMessage:
    def __init__(self, name, values):
        self.name = name
        self.values = values

    def get_value(self, name):
        if name not in self.values:
            raise KeyError(name)
        return self.values[name]


class FakeFitReader:
    def __init__(self, frames):
        self.frames = frames

    def __enter__(self):
        return iter(self.frames)

    def __exit__(self, exc_type, exc_value, traceback):
        return False


def mock_fit(monkeypatch, *, sport, sub_sport):
    frames = [
        FakeFitDataMessage(
            "session",
            {
                "sport": sport,
                "sub_sport": sub_sport,
                "start_time": datetime(
                    2026, 8, 27, tzinfo=timezone.utc
                ),
                "pool_length": 25,
                "total_distance": 1200,
            },
        )
    ]
    monkeypatch.setattr(
        fit_parser.fitdecode,
        "FitDataMessage",
        FakeFitDataMessage,
    )
    monkeypatch.setattr(
        fit_parser.fitdecode,
        "FitReader",
        lambda path: FakeFitReader(frames),
    )


def test_parse_pool_swimming_activity(monkeypatch):
    mock_fit(
        monkeypatch,
        sport="swimming",
        sub_sport="lap_swimming",
    )

    session = parse_swimming_fit("swimming.fit")

    assert session.distance_meters == 1200
    assert session.pool_length_meters == 25


def test_parse_non_swimming_activity_fails(monkeypatch):
    mock_fit(
        monkeypatch,
        sport="running",
        sub_sport="road",
    )

    with pytest.raises(
        NonSwimmingFitError,
        match="not a swimming activity",
    ):
        parse_swimming_fit("running.fit")


@pytest.mark.skipif(
    not FIT_PATH.exists(),
    reason="Garmin FIT fixture not mounted",
)
def test_parse_real_garmin_pool_swimming_fit():
    session = parse_swimming_fit(FIT_PATH)

    assert session.distance_meters == pytest.approx(
        1200,
        abs=1,
    )
    assert session.pool_length_meters == pytest.approx(
        25,
        abs=0.1,
    )

    assert session.total_timer_time_seconds == pytest.approx(
        2439,
        abs=3,
    )
    assert session.total_moving_time_seconds == pytest.approx(
        2016,
        abs=3,
    )

    assert session.heart_rate_average_bpm == 138
    assert session.heart_rate_max_bpm == 162

    assert session.total_strokes == 758

    assert session.average_stroke_rate_spm == 23

    assert (
        session.average_speed_meters_per_second
        == pytest.approx(0.595, abs=0.001)
    )
    assert (
        session.max_speed_meters_per_second
        == pytest.approx(1.724, abs=0.001)
    )
    assert (
        session.average_pace_seconds_per_100m
        == pytest.approx(168.07, abs=0.2)
    )

    assert session.total_calories == 389
    assert session.aerobic_training_effect == pytest.approx(
        3.3,
        abs=0.01,
    )
    assert session.anaerobic_training_effect == pytest.approx(
        2.3,
        abs=0.01,
    )

    active_lengths = [
        length
        for length in session.lengths
        if length.length_type != "idle"
    ]
    idle_lengths = [
        length
        for length in session.lengths
        if length.length_type == "idle"
    ]

    assert len(active_lengths) == 48
    assert len(idle_lengths) == 10
    assert len(session.lengths) == 58


def test_parse_fit_without_session_fails(tmp_path):
    path = tmp_path / "invalid.fit"
    path.write_bytes(b"not-a-fit-file")

    with pytest.raises(Exception):
        parse_swimming_fit(path)
