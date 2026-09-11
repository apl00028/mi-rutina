from fastapi import APIRouter
from app.domains.workouts.export import router as training_export_router

from app.domains.admin.router import router as admin_router
from app.domains.analytics.router import (
    router as analytics_router,
)
from app.domains.exercises.router import router as exercises_router
from app.domains.health.router import router as system_health_router
from app.domains.account.router import router as account_router
from app.domains.routines.router import router as routines_router
from app.domains.workouts.router import (
    router as workouts_router,
)
from app.domains.onboarding.router import (
    router as onboarding_router,
)
from app.domains.nutrition.router import router as nutrition_router
from app.domains.health_tracking.router import router as health_tracking_router
from app.domains.telemetry.router import (
    router as telemetry_router,
)
from app.domains.swimming.router import router as swimming_router
from app.domains.running.router import router as running_router
from app.domains.trainer.router import router as trainer_router
from app.domains.connections.router import router as connections_router
from app.domains.integrations.router import router as integrations_router
from app.domains.goals.router import router as goals_router
from app.domains.athlete_profile.router import router as athlete_profile_router


router = APIRouter(
    prefix="/api/v1"
)

router.include_router(
    system_health_router
)

router.include_router(
    account_router
)

router.include_router(
    admin_router
)

router.include_router(
    analytics_router
)

router.include_router(
    exercises_router
)

router.include_router(
    routines_router
)

router.include_router(
    workouts_router
)
router.include_router(
    onboarding_router
)


router.include_router(
    nutrition_router
)

router.include_router(
    health_tracking_router
)


router.include_router(
    telemetry_router
)


router.include_router(
    swimming_router
)

router.include_router(running_router)
router.include_router(connections_router)
router.include_router(integrations_router)

router.include_router(goals_router)
router.include_router(athlete_profile_router)


router.include_router(
    trainer_router
)

router.include_router(training_export_router)
