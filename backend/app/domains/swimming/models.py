from datetime import datetime

from pydantic import BaseModel


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
