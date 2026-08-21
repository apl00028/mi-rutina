from typing import Literal

from pydantic import BaseModel, Field


TrainingAnalyticsPeriod = Literal[
    "4w",
    "3m",
    "6m",
    "all",
]

ExerciseTrendStatus = Literal[
    "improving",
    "stable",
    "declining",
    "insufficient_data",
]


class TrainingAnalyticsSummary(BaseModel):
    workouts: int = 0
    completedSets: int = 0
    totalVolume: float = 0
    uniqueExercises: int = 0


class MuscleGroupAnalyticsItem(BaseModel):
    muscle: str
    completedSets: int


class ExerciseAnalyticsItem(BaseModel):
    exerciseId: str
    name: str
    recordTypes: list[str] = Field(
        default_factory=list
    )
    sessions: int = 0
    completedSets: int = 0
    maxWeight: float | None = None
    bestSet: str | None = None
    bestE1rm: float | None = None
    firstE1rm: float | None = None
    lastE1rm: float | None = None
    e1rmChange: float | None = None
    e1rmChangePercent: float | None = None
    trend: ExerciseTrendStatus = "insufficient_data"
    trendExposures: int = 0
    plateau: bool = False
    signal: str | None = None
    totalVolume: float | None = None
    lastMark: str | None = None


class ExerciseProgressPoint(BaseModel):
    workoutId: str
    date: str
    maxWeight: float | None = None
    bestE1rm: float | None = None
    bestReps: int | None = None
    totalReps: int | None = None
    validSets: int = 0
    rir: float | None = None


class ExerciseProgressSeries(BaseModel):
    exerciseId: str
    name: str
    points: list[ExerciseProgressPoint] = Field(
        default_factory=list
    )


class TrainingAnalyticsResponse(BaseModel):
    period: TrainingAnalyticsPeriod
    fromDate: str | None = None
    toDate: str
    summary: TrainingAnalyticsSummary
    muscleGroups: list[MuscleGroupAnalyticsItem] = Field(
        default_factory=list
    )
    exercises: list[ExerciseAnalyticsItem] = Field(
        default_factory=list
    )
    progress: list[ExerciseProgressSeries] = Field(
        default_factory=list
    )
