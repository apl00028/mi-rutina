from pathlib import Path

import fitdecode

from app.domains.swimming.models import (
    SwimmingFitSession,
    SwimmingLength,
)


class NonSwimmingFitError(ValueError):
    pass


_SWIMMING_SPORT_VALUES = {"swimming", 5}
_SWIMMING_SUB_SPORT_VALUES = {
    None,
    "generic",
    "lap_swimming",
    "open_water",
    0,
    17,
    18,
}


def _normalized_fit_value(value):
    if isinstance(value, str):
        return value.strip().lower().replace("-", "_").replace(" ", "_")

    return value


def _is_swimming_activity(sport, sub_sport) -> bool:
    return (
        _normalized_fit_value(sport) in _SWIMMING_SPORT_VALUES
        and _normalized_fit_value(sub_sport) in _SWIMMING_SUB_SPORT_VALUES
    )


def _field(frame: fitdecode.FitDataMessage, name: str):
    try:
        return frame.get_value(name)
    except (KeyError, ValueError):
        return None


def parse_swimming_fit(
    path: str | Path,
) -> SwimmingFitSession:
    session_data: dict = {}
    lengths: list[SwimmingLength] = []

    with fitdecode.FitReader(path) as fit:
        for frame in fit:
            if not isinstance(
                frame,
                fitdecode.FitDataMessage,
            ):
                continue

            if frame.name == "session":
                session_data = {
                    "sport": _field(frame, "sport"),
                    "sub_sport": _field(frame, "sub_sport"),
                    "start_time": _field(
                        frame,
                        "start_time",
                    ),
                    "pool_length_meters": _field(
                        frame,
                        "pool_length",
                    ),
                    "distance_meters": _field(
                        frame,
                        "total_distance",
                    ),
                    "total_elapsed_time_seconds": _field(
                        frame,
                        "total_elapsed_time",
                    ),
                    "total_timer_time_seconds": _field(
                        frame,
                        "total_timer_time",
                    ),
                    "total_moving_time_seconds": _field(
                        frame,
                        "total_moving_time",
                    ),
                    "heart_rate_average_bpm": _field(
                        frame,
                        "avg_heart_rate",
                    ),
                    "heart_rate_max_bpm": _field(
                        frame,
                        "max_heart_rate",
                    ),
                    "total_strokes": _field(
                        frame,
                        "total_strokes",
                    ),
                    "average_stroke_rate_spm": _field(
                        frame,
                        "avg_cadence",
                    ),
                    "average_speed_meters_per_second": _field(
                        frame,
                        "enhanced_avg_speed",
                    ),
                    "max_speed_meters_per_second": _field(
                        frame,
                        "enhanced_max_speed",
                    ),
                    "total_calories": _field(
                        frame,
                        "total_calories",
                    ),
                    "aerobic_training_effect": _field(
                        frame,
                        "total_training_effect",
                    ),
                    "anaerobic_training_effect": _field(
                        frame,
                        "total_anaerobic_training_effect",
                    ),
                }

            elif frame.name == "length":
                lengths.append(
                    SwimmingLength(
                        start_time=_field(
                            frame,
                            "start_time",
                        ),
                        duration_seconds=_field(
                            frame,
                            "total_timer_time",
                        ),
                        distance_meters=_field(
                            frame,
                            "total_distance",
                        ),
                        total_strokes=_field(
                            frame,
                            "total_strokes",
                        ),
                        average_stroke_rate_spm=_field(
                            frame,
                            "avg_swimming_cadence",
                        ),
                        swim_stroke=_field(
                            frame,
                            "swim_stroke",
                        ),
                        length_type=_field(
                            frame,
                            "length_type",
                        ),
                    )
                )

    if not session_data:
        raise ValueError(
            "FIT file does not contain a session message"
        )

    sport = session_data.pop("sport")
    sub_sport = session_data.pop("sub_sport")

    if not _is_swimming_activity(sport, sub_sport):
        raise NonSwimmingFitError(
            "FIT file is not a swimming activity"
        )

    average_speed = session_data.get(
        "average_speed_meters_per_second"
    )

    if (
        isinstance(average_speed, (int, float))
        and average_speed > 0
    ):
        session_data[
            "average_pace_seconds_per_100m"
        ] = 100.0 / average_speed

    if session_data.get("total_moving_time_seconds") is None:
        active_duration = sum(
            length.duration_seconds or 0.0
            for length in lengths
            if length.length_type != "idle"
        )

        if active_duration > 0:
            session_data[
                "total_moving_time_seconds"
            ] = active_duration

    return SwimmingFitSession(
        **session_data,
        lengths=lengths,
    )
