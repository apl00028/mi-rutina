from datetime import date, timedelta
from typing import Any

from app.core.auth import AuthenticatedUser
from app.domains.health_tracking.models import (
    DailyCheckIn,
    DailyCheckInInput,
    WeeklyCheckIn,
    WeeklyCheckInInput,
    WeightEntry,
    WeightEntryInput,
    WeightTrendSummary,
)
from app.domains.health_tracking.repository import (
    delete_weight_entry,
    list_daily_checkins,
    list_weekly_checkins,
    list_weight_entries,
    upsert_daily_checkin,
    upsert_weekly_checkin,
    upsert_weight_entry,
)


def weight_row_to_model(
    row: dict[str, Any],
) -> WeightEntry:
    return WeightEntry.model_validate({
        "id":
            row["id"],
        "measurementDate":
            row["measurement_date"],
        "weightKg":
            row["weight_kg"],
        "bodyFatPercent":
            row.get(
                "body_fat_percent"
            ),
        "muscleMassKg":
            row.get(
                "muscle_mass_kg"
            ),
        "bodyWaterPercent":
            row.get(
                "body_water_percent"
            ),
        "visceralFatIndex":
            row.get(
                "visceral_fat_index"
            ),
        "source":
            row.get(
                "source",
                "manual",
            ),
        "notes":
            row.get("notes"),
        "createdAt":
            row.get("created_at"),
        "updatedAt":
            row.get("updated_at"),
    })


def checkin_row_to_model(
    row: dict[str, Any],
) -> WeeklyCheckIn:
    return WeeklyCheckIn.model_validate({
        "id":
            row["id"],
        "weekStart":
            row["week_start"],
        "fatigue":
            row.get("fatigue"),
        "hunger":
            row.get("hunger"),
        "recovery":
            row.get("recovery"),
        "motivation":
            row.get("motivation"),
        "waistCm":
            row.get("waist_cm"),
        "dietAdherencePercent":
            row.get(
                "diet_adherence_percent"
            ),
        "notes":
            row.get("notes"),
        "createdAt":
            row.get("created_at"),
        "updatedAt":
            row.get("updated_at"),
    })


def daily_checkin_row_to_model(
    row: dict[str, Any],
) -> DailyCheckIn:
    return DailyCheckIn.model_validate({
        "id":
            row["id"],
        "measurementDate":
            row["measurement_date"],
        "hunger":
            row.get("hunger"),
        "dietAdherencePercent":
            row.get(
                "diet_adherence_percent"
            ),
        "notes":
            row.get("notes"),
        "createdAt":
            row.get("created_at"),
        "updatedAt":
            row.get("updated_at"),
    })


async def list_user_weight_entries(
    user: AuthenticatedUser,
) -> list[WeightEntry]:
    rows = await list_weight_entries(user)

    return [
        weight_row_to_model(row)
        for row in rows
    ]


async def save_user_weight_entry(
    user: AuthenticatedUser,
    measurement_date: date,
    request: WeightEntryInput,
) -> WeightEntry:
    row = await upsert_weight_entry(
        user,
        measurement_date,
        request.model_dump(
            mode="json",
            exclude_none=True,
        ),
    )

    return weight_row_to_model(row)


async def delete_user_weight_entry(
    user: AuthenticatedUser,
    measurement_date: date,
) -> bool:
    return await delete_weight_entry(
        user,
        measurement_date,
    )


async def list_user_weekly_checkins(
    user: AuthenticatedUser,
) -> list[WeeklyCheckIn]:
    rows = await list_weekly_checkins(user)

    return [
        checkin_row_to_model(row)
        for row in rows
    ]


async def save_user_weekly_checkin(
    user: AuthenticatedUser,
    week_start: date,
    request: WeeklyCheckInInput,
) -> WeeklyCheckIn:
    row = await upsert_weekly_checkin(
        user,
        week_start,
        request.model_dump(
            mode="json",
            exclude_none=True,
        ),
    )

    return checkin_row_to_model(row)



async def list_user_daily_checkins(
    user: AuthenticatedUser,
) -> list[DailyCheckIn]:
    rows = await list_daily_checkins(user)

    return [
        daily_checkin_row_to_model(row)
        for row in rows
    ]


async def save_user_daily_checkin(
    user: AuthenticatedUser,
    measurement_date: date,
    request: DailyCheckInInput,
) -> DailyCheckIn:
    row = await upsert_daily_checkin(
        user,
        measurement_date,
        request.model_dump(
            mode="json",
            exclude_none=True,
        ),
    )

    return daily_checkin_row_to_model(row)


def build_weight_trend(
    entries: list[WeightEntry],
) -> WeightTrendSummary:
    if not entries:
        return WeightTrendSummary()

    ordered = sorted(
        entries,
        key=lambda entry:
            entry.measurementDate,
    )

    latest = ordered[-1]

    recent_start = (
        latest.measurementDate
        - timedelta(days=6)
    )
    previous_start = (
        latest.measurementDate
        - timedelta(days=13)
    )
    previous_end = (
        latest.measurementDate
        - timedelta(days=7)
    )

    recent = [
        entry.weightKg
        for entry in ordered
        if (
            recent_start
            <= entry.measurementDate
            <= latest.measurementDate
        )
    ]

    previous = [
        entry.weightKg
        for entry in ordered
        if (
            previous_start
            <= entry.measurementDate
            <= previous_end
        )
    ]

    recent_average = (
        round(
            sum(recent) / len(recent),
            2,
        )
        if recent
        else None
    )

    previous_average = (
        round(
            sum(previous) / len(previous),
            2,
        )
        if previous
        else None
    )

    change_kg = None
    change_percent = None

    if (
        recent_average is not None
        and previous_average is not None
    ):
        change_kg = round(
            recent_average
            - previous_average,
            2,
        )

        if previous_average > 0:
            change_percent = round(
                (
                    change_kg
                    / previous_average
                )
                * 100,
                2,
            )

    return WeightTrendSummary(
        currentWeightKg=latest.weightKg,
        currentBodyFatPercent=(
            latest.bodyFatPercent
        ),
        latestMeasurementDate=(
            latest.measurementDate
        ),
        recentAverageKg=recent_average,
        previousAverageKg=(
            previous_average
        ),
        changeKg=change_kg,
        changePercent=change_percent,
        recentEntries=len(recent),
        previousEntries=len(previous),
    )
